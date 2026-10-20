// Rendering fixture for UI checks when Docker is unavailable. This does not
// model voting correctness; the SQL suites remain the authority for that.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const catalog = JSON.parse(readFileSync("data/songs.json", "utf8"));
const songs = Array.from({ length: 540 }, (_, i) => {
  const song = catalog[i % catalog.length];
  return {
    id: i < catalog.length ? song.id : `${song.id}-${i}`,
    title: song.title,
    artist_name: song.artistName,
    album_name: song.albumName,
    release_year: song.releaseYear,
    genre: song.genre,
    elo_rating: 1500 + (i % 8),
    matchup_count: i % 3 === 0 ? 0 : 6,
    wins: i % 3 === 0 ? 0 : 4,
    losses: i % 3 === 0 ? 0 : 2,
    status: "active",
    providers: song.providers.map((provider) => ({
      provider: provider.provider,
      provider_song_id: provider.providerSongId,
      external_url: provider.externalUrl,
    })),
  };
});
const uid = "11111111-1111-4111-8111-111111111111";
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  is_anonymous: true,
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
  identities: [],
};
const token =
  [
    { alg: "HS256", typ: "JWT" },
    {
      sub: uid,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      is_anonymous: true,
    },
  ]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".") + ".fixture-signature";
let pair = null,
  sequence = 0;
const nextPair = () => {
  const index = (sequence++ * 2) % songs.length;
  return {
    id: `22222222-2222-4222-8222-${String(sequence).padStart(12, "0")}`,
    song_a_id: songs[index].id,
    song_b_id: songs[index + 1].id,
    expires_at: new Date(Date.now() + 1800000).toISOString(),
  };
};
let playAvailable = true;
let play = {
  run: { id: uid, score: 1, status: "paused", reason: "insufficient" },
  round: null,
  answer: null,
};
const playRound = () => ({
  id: randomUUID(),
  number: play.run.score + 1,
  songAId: songs[0].id,
  songBId: songs[1].id,
  expiresAt: new Date(Date.now() + 1800000).toISOString(),
});
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3101");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") return res.end();
  const url = new URL(req.url, "http://127.0.0.1:55329");
  const send = (value) => res.end(JSON.stringify(value));
  if (url.pathname === "/__fixture/rank-reset") {
    pair = null;
    return send({});
  }
  if (url.pathname === "/__fixture/play-available") {
    playAvailable = url.searchParams.get("value") !== "false";
    return send({});
  }
  if (url.pathname === "/rest/v1/rpc/start_fresh_play") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const { p_run_id } = JSON.parse(Buffer.concat(chunks).toString());
    if (play.run.id !== p_run_id) {
      play = {
        run: {
          id: p_run_id,
          score: 0,
          status: playAvailable ? "active" : "ended",
          reason: playAvailable ? null : "insufficient",
        },
        round: null,
        answer: null,
      };
      if (playAvailable) play.round = playRound();
    }
    return send({ runId: p_run_id });
  }
  if (url.pathname === "/rest/v1/rpc/submit_play_guess") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const { p_round_id, p_selected_song_id } = JSON.parse(
      Buffer.concat(chunks).toString(),
    );
    const correct = p_selected_song_id === songs[0].id;
    if (correct) play.run.score++;
    else {
      play.run.status = "ended";
      play.run.reason = "wrong";
    }
    play.answer = {
      id: p_round_id,
      runId: play.run.id,
      titleA: songs[0].title,
      titleB: songs[1].title,
      ratingA: 1512,
      ratingB: 1488,
      selectedSongId: p_selected_song_id,
      correct,
      scoreAfter: play.run.score,
      replacementSlot: correct ? 1 : null,
    };
    play.round = correct ? playRound() : null;
    return send({ correct });
  }
  if (url.pathname === "/realtime/v1/websocket") {
    res.statusCode = 503;
    return send({});
  }
  if (url.pathname === "/auth/v1/signup" || url.pathname === "/auth/v1/token")
    return send({
      access_token: token,
      refresh_token: "fixture-refresh",
      expires_in: 3600,
      token_type: "bearer",
      user,
    });
  if (url.pathname === "/auth/v1/user") return send(user);
  if (url.pathname === "/rest/v1/profiles")
    return send({
      user_id: uid,
      role: "user",
      display_name: "Listener",
      total_votes: 0,
      current_streak: 0,
      longest_streak: 0,
    });
  if (url.pathname === "/rest/v1/rpc/get_rank_state") return send(pair);
  if (url.pathname === "/rest/v1/rpc/start_rank_pair") {
    pair ??= nextPair();
    return send({ comparisonId: pair.id });
  }
  if (url.pathname === "/rest/v1/rpc/submit_rank_vote") {
    pair = nextPair();
    return send({});
  }
  if (url.pathname === "/rest/v1/rank_votes")
    return send({ id: "fixture-vote" });
  if (url.pathname === "/rest/v1/rpc/get_play_state") return send(play);
  if (url.pathname === "/rest/v1/song_catalog") {
    const id = url.searchParams.get("id");
    if (id?.startsWith("eq."))
      return send(songs.find((song) => song.id === id.slice(3)) ?? null);
    let filtered = songs;
    const artist = url.searchParams.get("artist_name");
    if (artist?.startsWith("ilike."))
      filtered = filtered.filter((song) =>
        song.artist_name
          .toLowerCase()
          .includes(artist.slice(6).replaceAll("%", "").toLowerCase()),
      );
    const offset = Number(url.searchParams.get("offset") ?? 0),
      limit = Number(url.searchParams.get("limit") ?? 25);
    res.setHeader(
      "Content-Range",
      `${offset}-${Math.min(offset + limit, filtered.length) - 1}/${filtered.length}`,
    );
    return send(filtered.slice(offset, offset + limit));
  }
  console.error(
    "Unhandled rendering fixture request:",
    req.method,
    url.pathname,
  );
  res.statusCode = 404;
  send({ message: "Rendering fixture endpoint is not implemented." });
});
server.listen(55329, "127.0.0.1", () =>
  console.log("UI rendering fixture listening on 55329"),
);

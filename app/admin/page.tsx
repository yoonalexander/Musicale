import { SubmitButton } from "@/components/submit-button";
import { scheduleReview } from "@/lib/editorial";
export const metadata = {
  title: "Editorial tools",
  description:
    "Manage Musicale songs, future matchups, availability and ranking recovery.",
};
import {
  importSongs,
  scheduleMatchup,
  updateKFactor,
  updateSongStatus,
  manageMatchup,
  rebuildRankings,
  scheduleEditorialMonth,
} from "@/app/actions";
import { getAdminData } from "@/lib/data";
import { requireAdmin } from "@/lib/auth";
import { CatalogEditor } from "@/components/catalog-editor";
import { CatalogDiscovery } from "@/components/catalog-discovery";
import { MetadataEnrichment } from "@/components/metadata-enrichment";
import { AudioEditor } from "@/components/audio-editor";
import { playablePreview } from "@/lib/audio";

// MusicBrainz batches deliberately space requests; allow time for a reviewed ten-song import.
export const maxDuration = 60;

const example = [
  {
    id: "respect-aretha",
    title: "Respect",
    artistName: "Aretha Franklin",
    albumName: "I Never Loved a Man the Way I Love You",
    releaseYear: 1967,
    genre: "Soul",
    status: "active",
    providers: [
      {
        provider: "youtube",
        providerSongId: "JzqGZjFnYnA",
        externalUrl: "https://www.youtube.com/watch?v=JzqGZjFnYnA",
      },
    ],
  },
];
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const [data, params] = await Promise.all([getAdminData(), searchParams]);
  const playable = data.songs.filter(
    (s) =>
      s.status === "active" &&
      (s.providers.some((p) => p.provider !== "musicbrainz") ||
        playablePreview(s.audioPreview)),
  );
  const songNames = Object.fromEntries(data.songs.map((s) => [s.id, s.title]));
  const queue = data.matchups.filter(
    (m) =>
      m.matchup_day > new Date().toISOString().slice(0, 10) &&
      m.matchup_day <=
        new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) &&
      m.status !== "cancelled",
  );
  const review = scheduleReview(queue.map((m) => [m.song_a_id, m.song_b_id]));
  return (
    <section className="page">
      <header className="page-title">
        <p className="kicker">Editorial tools</p>
        <h1>Make tomorrow’s choice.</h1>
      </header>
      {params.message ? (
        <p className="notice" role="status">
          {params.message}
        </p>
      ) : null}
      <section className="panel">
        <h2>Participation overview</h2>
        <dl className="stats">
          <div>
            <dt>Player identities (including guests)</dt>
            <dd>{data.overview.accounts}</dd>
          </div>
          <div>
            <dt>Recorded votes</dt>
            <dd>{data.overview.votes}</dd>
          </div>
          <div>
            <dt>Votes today</dt>
            <dd>{data.overview.todayVotes}</dd>
          </div>
        </dl>
        <details>
          <summary>Daily participation</summary>
          <ul>
            {data.overview.daily.map((d) => (
              <li key={d.matchup_day}>
                {d.matchup_day} · {d.votes} votes · {d.status}
              </li>
            ))}
          </ul>
        </details>
      </section>
      <section className="panel">
        <h2>Schedule or replace a future matchup</h2>
        <p>
          Build your own pair below, or queue 30 different curated pairs across
          the next 30 UTC days. The starter plan connects all twenty songs, with
          three opponents each. Existing scheduled days are preserved.
        </p>
        <p className="notice">
          {data.readiness.today_playable
            ? "Today is playable."
            : "Today needs attention: no playable pair."}{" "}
          {data.readiness.buffer_days} consecutive future days are playable.
          {data.readiness.buffer_days < 14
            ? " Replenish or repair the queue to keep at least 14 days ahead."
            : " The minimum 14-day buffer is covered."}
        </p>
        <p>{queue.length} of the next 30 days are scheduled.</p>
        {queue.length === 30 ? (
          <p className="notice">
            {review.duplicates === 0 &&
            review.fewOpponents === 0 &&
            review.groups === 1
              ? "Variety check passed: unique pairs, at least two opponents per song, one connected catalog."
              : `Review this queue: ${review.duplicates} repeated pairs, ${review.fewOpponents} songs with fewer than two opponents, ${review.groups} comparison groups. Replace future matchups below to improve variety.`}
          </p>
        ) : (
          <p>
            The full variety check is available when all 30 days are scheduled.
          </p>
        )}
        <form action={scheduleEditorialMonth}>
          <SubmitButton className="button secondary">
            Queue next 30 days
          </SubmitButton>
        </form>
        <form action={scheduleMatchup} className="admin-form">
          <label>
            Replace upcoming matchup (optional)
            <select name="replaceId">
              <option value="">Create a new matchup</option>
              {data.matchups
                .filter((m) => Date.parse(m.starts_at) > Date.now())
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.matchup_day}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Musicale day (UTC)
            <input
              name="day"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
          <label>
            Song A
            <select name="songA" required>
              {playable.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.title} — {s.artistName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Song B
            <select name="songB" required defaultValue={playable[1]?.id}>
              {playable.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.title} — {s.artistName}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton className="button" disabled={playable.length < 2}>
            Save matchup
          </SubmitButton>
        </form>
      </section>
      <section className="panel">
        <h2>Scheduled matchups and vote counts</h2>
        {data.matchups.length ? (
          <ul>
            {data.matchups.map((m) => (
              <li key={m.id}>
                {m.matchup_day} · {songNames[m.song_a_id] ?? m.song_a_id} vs{" "}
                {songNames[m.song_b_id] ?? m.song_b_id} ·{" "}
                {m.song_a_votes + m.song_b_votes} votes · {m.status}
                <form action={manageMatchup} className="inline-form">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="operation" value="feature" />
                  <label className="checkbox-label">
                    <input
                      name="featured"
                      type="checkbox"
                      defaultChecked={m.featured}
                    />
                    Feature {m.matchup_day} after voting closes
                  </label>
                  <SubmitButton className="button secondary">
                    Save feature
                  </SubmitButton>
                </form>
                {Date.parse(m.starts_at) > Date.now() &&
                m.status !== "cancelled" ? (
                  <form action={manageMatchup}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="operation" value="cancel" />
                    <SubmitButton className="text-button">
                      Cancel {m.matchup_day} matchup
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No upcoming matchups.</p>
        )}
      </section>
      <CatalogEditor songs={data.songs} />
      <CatalogDiscovery sources={data.sources} />
      <MetadataEnrichment names={songNames} />
      <AudioEditor songs={data.songs} audio={data.audio} />
      <section className="panel">
        <h2>Add, edit or import songs</h2>
        <details>
          <summary>Open bulk import</summary>
          <p>
            Paste or upload JSON or CSV (1–100 songs). Existing IDs update
            metadata and providers while preserving ratings. Use official
            provider links; verify the upload before scheduling it. Imports are
            atomic.
          </p>
          <form action={importSongs} className="admin-form">
            <label>
              Import format
              <select name="format">
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </label>
            <label>
              Catalog file (optional)
              <input
                name="file"
                type="file"
                accept=".csv,.json,text/csv,application/json"
              />
            </label>
            <label>
              Catalog JSON or CSV
              <textarea
                name="catalog"
                rows={12}
                defaultValue={JSON.stringify(example, null, 2)}
              />
            </label>
            <label className="checkbox-label">
              <input name="artworkPermission" type="checkbox" />I have
              permission to display any artwork supplied in this import.
            </label>
            <p>
              CSV uses the same field names as JSON; the providers column
              contains a quoted JSON array.{" "}
              <a href="/catalog-template.csv" download>
                Download CSV template
              </a>
              .
            </p>
            <SubmitButton className="button">Save catalog</SubmitButton>
          </form>
          <p>
            <a href="/starter-catalog.json" download>
              Download the twenty-song starter catalog
            </a>{" "}
            to restore missing starter entries through the import form.
          </p>
        </details>
      </section>
      <section className="panel">
        <h2>Provider readiness</h2>
        <p>
          Official links are validated when saved. Open the provider link to
          check playback in your region before scheduling.
        </p>
        {data.songs.filter(
          (s) =>
            s.status === "active" &&
            !s.providers.some((p) => p.provider !== "musicbrainz") &&
            !playablePreview(s.audioPreview),
        ).length ? (
          <ul>
            {data.songs
              .filter(
                (s) =>
                  s.status === "active" &&
                  !s.providers.some((p) => p.provider !== "musicbrainz") &&
                  !playablePreview(s.audioPreview),
              )
              .map((s) => (
                <li key={s.id}>
                  {s.title} — {s.artistName}: missing a playback link
                </li>
              ))}
          </ul>
        ) : (
          <p>All active songs have playback links.</p>
        )}
        <p>
          {data.songs.filter((s) => s.status !== "active").length} songs marked
          unavailable or disabled.
        </p>
      </section>
      <section className="panel">
        <h2>Voting activity review</h2>
        <p>
          Accounts with more than 20 vote attempts in 24 hours. These are review
          signals, not proof of abuse. Counters older than seven days are
          removed on subsequent requests; no IP addresses are stored.
        </p>
        {data.overview.suspicious.length ? (
          <ul>
            {data.overview.suspicious.map((a) => (
              <li key={a.user_id}>
                {a.user_id} · {a.attempts} attempts · {a.limited_minutes}{" "}
                rate-limited minutes
              </li>
            ))}
          </ul>
        ) : (
          <p>No unusual request volume in the last 24 hours.</p>
        )}
      </section>
      <section className="panel">
        <h2>Opt-in product events</h2>
        <p>
          Daily aggregate counts from signed-in listeners who enabled analytics.
          No email, song selections or analytics identifiers are stored. These
          counts are observational, not unique visitor totals.
        </p>
        {data.events.length ? (
          <ul>
            {data.events.map((e) => (
              <li key={`${e.event_day}-${e.event}`}>
                {e.event_day} · {e.event.replaceAll("_", " ")} · {e.count}
              </li>
            ))}
          </ul>
        ) : (
          <p>No opted-in events recorded yet.</p>
        )}
      </section>
      <section className="panel">
        <h2>Ranking recovery</h2>
        <p>
          Rebuild song ratings, win/loss records, vote counts and charts from
          recorded rating events. Original votes and their historical K-factors
          remain the source of truth. This operation pauses new votes while it
          runs and is audited.
        </p>
        <form action={rebuildRankings} className="admin-form">
          <label className="checkbox-label">
            <input name="confirm" type="checkbox" required />
            Rebuild all derived rankings from the recorded events.
          </label>
          <SubmitButton className="button secondary">
            Rebuild rankings
          </SubmitButton>
        </form>
      </section>
      <section className="panel">
        <h2>Song availability</h2>
        <details>
          <summary>Manage song availability</summary>
          {data.songs.map((s) => (
            <form key={s.id} action={updateSongStatus} className="status-form">
              <input type="hidden" name="id" value={s.id} />
              <span>
                {s.title} — {s.artistName}
              </span>
              <label>
                <span className="sr-only">Status for {s.title}</span>
                <select name="status" defaultValue={s.status}>
                  <option value="active">Active</option>
                  <option value="unavailable">Unavailable</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <SubmitButton className="button secondary">Save</SubmitButton>
            </form>
          ))}
        </details>
      </section>
      <section className="panel">
        <h2>Elo settings</h2>
        <form action={updateKFactor} className="admin-form">
          <label>
            K-factor (future votes)
            <input
              name="kFactor"
              type="number"
              min="1"
              max="100"
              required
              defaultValue={data.kFactor}
            />
          </label>
          <SubmitButton className="button">Save K-factor</SubmitButton>
        </form>
      </section>
      <section className="panel">
        <h2>Recent editorial changes</h2>
        <details>
          <summary>Show recent changes</summary>
          {data.audit.length ? (
            <ul>
              {data.audit.map((a) => (
                <li key={a.id}>
                  {a.created_at.slice(0, 16)} UTC · {a.operation} {a.entity} ·{" "}
                  {a.entity_id}
                </li>
              ))}
            </ul>
          ) : (
            <p>No editorial changes yet.</p>
          )}
        </details>
      </section>
    </section>
  );
}

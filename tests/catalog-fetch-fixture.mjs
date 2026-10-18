import { readFileSync, mkdirSync, appendFileSync } from "node:fs";
mkdirSync(new URL("../tmp/", import.meta.url), { recursive: true });
const records = JSON.parse(
  readFileSync(new URL("./fixtures/catalog.json", import.meta.url), "utf8"),
);
const originalFetch = globalThis.fetch;
// Loaded only by the local Playwright server; product builds contain no fixture switch.
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.hostname === "coverartarchive.org") {
    const release = "44444444-4444-4444-8444-444444444444";
    return url.pathname === `/release/${release}`
      ? Response.json({
          images: [
            {
              id: 123,
              front: true,
              approved: true,
              thumbnails: {
                500: `https://coverartarchive.org/release/${release}/123-500.jpg`,
              },
            },
          ],
        })
      : new Response(null, { status: 404 });
  }
  if (
    url.origin === "https://www.googleapis.com" &&
    url.pathname.startsWith("/youtube/v3/")
  ) {
    if (url.searchParams.get("key") !== "musicale-browser-fixture")
      throw new Error("Browser tests must use the dummy YouTube key.");
    if (url.pathname.endsWith("/search")) {
      if (url.searchParams.get("regionCode") === "ZZ")
        return new Response(null, { status: 403 });
      return Response.json({ items: [{ id: { videoId: "JzqGZjFnYnA" } }] });
    }
    if (url.pathname.endsWith("/videos")) {
      appendFileSync(
        new URL("../tmp/youtube-fixture-requests.log", import.meta.url),
        "video-metadata\n",
      );
      return Response.json({
        items: (url.searchParams.get("id") ?? "").split(",").map((id) => ({
          id,
          snippet: {
            title: "Respect (recording fixture)",
            channelTitle: "Musicale browser fixture",
          },
          status: { embeddable: true, madeForKids: id === "Fpu5a0Bl8eY" },
          contentDetails: {
            duration: "PT2M28S",
            regionRestriction: { allowed: ["CA"] },
          },
        })),
      });
    }
    throw new Error("Unexpected YouTube fixture request.");
  }
  if (
    url.origin === "https://commons.wikimedia.org" &&
    url.pathname === "/w/api.php"
  )
    return Response.json(
      JSON.parse(
        readFileSync(
          new URL("./fixtures/commons-previews.json", import.meta.url),
          "utf8",
        ),
      ),
    );
  if (
    url.origin === "https://musicbrainz.org" &&
    url.pathname.startsWith("/ws/2/recording")
  ) {
    const id = url.pathname.split("/").at(-1);
    const record = records.find((r) => r.id === id);
    if (record) return Response.json(record);
    if (url.searchParams.get("query") === "Musicale Fixture")
      return Response.json({
        recordings: records.map(({ relations, ...r }) => r),
        count: records.length,
      });
    if (url.searchParams.get("query") === "Musicale Outage")
      return new Response(null, { status: 503 });
    throw new Error(
      "Browser tests must use a known catalog fixture, never the live provider.",
    );
  }
  return originalFetch(input, init);
};

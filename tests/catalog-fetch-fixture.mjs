import { readFileSync } from "node:fs";
const records = JSON.parse(
  readFileSync(new URL("./fixtures/catalog.json", import.meta.url), "utf8"),
);
const originalFetch = globalThis.fetch;
// Loaded only by the local Playwright server; product builds contain no fixture switch.
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
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

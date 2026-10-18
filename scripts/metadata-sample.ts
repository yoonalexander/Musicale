import { metadataApi, chooseMetadata } from "../lib/metadata-enrichment";
import { readFileSync, writeFileSync } from "node:fs";
const sampleIds = [
  "africa-toto",
  "respect-aretha",
  "bad-guy-billie-eilish",
  "dynamite-bts",
  "alors-on-danse-stromae",
  "blinding-lights-the-weeknd",
];
const data = [
  ...JSON.parse(readFileSync("data/songs.json", "utf8")),
  ...JSON.parse(readFileSync("data/catalog-expansion-2026-10-17.json", "utf8")),
]
  .filter((s) => sampleIds.includes(s.id))
  .map((s) => ({
    id: s.id,
    title: s.title,
    artist_name: s.artistName,
    album_name: s.albumName,
    release_year: s.releaseYear,
  }));
let next = 0;
const api = metadataApi(async () => {
  await new Promise((r) => setTimeout(r, Math.max(0, next - Date.now())));
  next = Date.now() + 1100;
});
const results = [];
for (const song of data) {
  try {
    const result = await api.search(song);
    let selected = chooseMetadata(result.candidates, result.truncated);
    if (selected) {
      selected = await api.lookup(
        song,
        selected.recordingId,
        selected.releaseId,
      );
      if (selected) selected.artwork = await api.artwork(selected);
    }
    results.push({
      songId: song.id,
      selected,
      candidates: result.candidates.slice(0, 5),
      truncated: result.truncated,
    });
    console.log(
      song.id,
      selected ? "matched" : "review",
      result.candidates.length,
    );
  } catch (error) {
    results.push({ songId: song.id, error: String(error) });
    console.log(song.id, "provider failure");
  }
}
writeFileSync("output/metadata-sample.json", JSON.stringify(results, null, 2));

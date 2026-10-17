import { unstable_cache } from "next/cache";
import { validateYouTubeVideos } from "./youtube-data";
import { youtubeVideoId } from "./youtube";
import type { Song } from "@/types/domain";

// shortcut: warm-instance memo survives route invalidation; persist validation records before large multi-instance traffic.
const recent = new Map<
  string,
  { value: Song["youtubeValidation"]; until: number }
>();
function remember(id: string, value: Song["youtubeValidation"]) {
  recent.set(id, {
    value,
    until: value ? Date.parse(value.checkedAt) + 86400000 : Date.now() + 60000,
  });
  if (recent.size > 1000) recent.delete(recent.keys().next().value!);
  return value;
}

const validate = unstable_cache(
  async (id: string) => {
    const [video] = await validateYouTubeVideos([id]);
    return video
      ? {
          videoId: id,
          madeForKids: video.madeForKids,
          checkedAt: new Date().toISOString(),
        }
      : null;
  },
  ["youtube-player-validation"],
  { revalidate: 86400 },
);

export async function withYouTubeValidation(song: Song): Promise<Song> {
  const source = song.providers.find(
    (provider) => provider.provider === "youtube",
  );
  const id = source && youtubeVideoId(source.externalUrl);
  if (!id || !process.env.YOUTUBE_API_KEY) return song;
  const cached = recent.get(id),
    now = Date.now();
  if (
    cached &&
    cached.until > now &&
    (!cached.value || Date.parse(cached.value.checkedAt) <= now)
  )
    return { ...song, youtubeValidation: cached.value };
  try {
    return { ...song, youtubeValidation: remember(id, await validate(id)) };
  } catch {
    // Metadata outages do not block voting; unknown sources never send player analytics.
    return { ...song, youtubeValidation: remember(id, null) };
  }
}

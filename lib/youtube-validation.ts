import { unstable_cache } from "next/cache";
import { validateYouTubeVideos } from "./youtube-data";
import { youtubeVideoId } from "./youtube";
import type { Song } from "@/types/domain";

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
  try {
    return { ...song, youtubeValidation: await validate(id) };
  } catch {
    // Metadata outages do not block voting; unknown sources never send player analytics.
    return song;
  }
}

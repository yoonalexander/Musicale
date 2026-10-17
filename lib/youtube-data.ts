import { youtubeVideoId } from "./youtube";

export interface YouTubeVideo {
  id: string;
  title: string;
  channel: string;
  duration: string;
  embeddable: boolean;
  madeForKids: boolean | null;
  allowedRegions: string[] | null;
  blockedRegions: string[];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function request(
  endpoint: "videos" | "search",
  params: Record<string, string>,
): Promise<unknown[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key)
    throw new Error("YouTube discovery is not configured on this server.");
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [name, value] of Object.entries(params))
    url.searchParams.set(name, value);
  url.searchParams.set("key", key);
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Fetch errors can contain the request URL, including the API key.
    throw new Error("YouTube could not be reached. Try again later.");
  }
  if (!response.ok) {
    if (response.status === 403 || response.status === 429)
      throw new Error(
        "YouTube denied the request. Check the server key restrictions and quota before retrying.",
      );
    throw new Error("YouTube could not complete the request. Try again later.");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("YouTube returned an invalid response.");
  }
  if (!data || !Array.isArray(data.items))
    throw new Error("YouTube returned an invalid response.");
  return data.items;
}

export async function validateYouTubeVideos(
  ids: string[],
): Promise<YouTubeVideo[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  if (unique.length > 50 || unique.some((id) => youtubeVideoId(id) !== id))
    throw new Error("Validate between 1 and 50 YouTube video IDs.");
  const rows = await request("videos", {
    part: "snippet,status,contentDetails",
    id: unique.join(","),
    fields:
      "items(id,snippet(title,channelTitle),status(embeddable,madeForKids),contentDetails(duration,regionRestriction))",
  });
  return rows.flatMap((value) => {
    const row = object(value),
      snippet = object(row.snippet),
      status = object(row.status),
      details = object(row.contentDetails);
    if (
      typeof row.id !== "string" ||
      !unique.includes(row.id) ||
      typeof snippet.title !== "string" ||
      typeof snippet.channelTitle !== "string" ||
      typeof status.embeddable !== "boolean"
    )
      return [];
    const regions = (value: unknown): string[] | null =>
      Array.isArray(value) &&
      value.every((code) => typeof code === "string" && /^[A-Z]{2}$/.test(code))
        ? value
        : null;
    const restrictions = object(details.regionRestriction);
    return [
      {
        id: row.id,
        title: snippet.title,
        channel: snippet.channelTitle,
        duration: typeof details.duration === "string" ? details.duration : "",
        embeddable: status.embeddable,
        madeForKids:
          typeof status.madeForKids === "boolean" ? status.madeForKids : null,
        allowedRegions: regions(restrictions.allowed),
        blockedRegions: regions(restrictions.blocked) ?? [],
      },
    ];
  });
}

export async function searchYouTubeVideos(
  artist: string,
  title: string,
  region: string,
): Promise<YouTubeVideo[]> {
  if (
    !artist.trim() ||
    !title.trim() ||
    artist.length > 200 ||
    title.length > 200 ||
    !/^[A-Z]{2}$/.test(region)
  )
    throw new Error("Provide a song, artist and two-letter country code.");
  const rows = await request("search", {
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    maxResults: "5",
    regionCode: region,
    q: `"${artist}" "${title}" official audio`,
    fields: "items(id/videoId)",
  });
  const ids = rows.flatMap((row) => {
    const id = object(object(row).id).videoId;
    return typeof id === "string" && youtubeVideoId(id) === id ? [id] : [];
  });
  return (await validateYouTubeVideos(ids)).filter((video) =>
    availableInRegion(video, region),
  );
}

export function availableInRegion(video: YouTubeVideo, region: string) {
  return (
    video.embeddable &&
    !video.blockedRegions.includes(region) &&
    (video.allowedRegions === null || video.allowedRegions.includes(region))
  );
}

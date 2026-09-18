// CapCut template downloader — extracts template metadata and video URL.
// Ported from the standalone scraper into a bundled, SSRF-safe module.
import { safeHttp } from "./http.js";

const extractHashtags = (text: string): string[] => {
  if (!text) return [];
  const matches = text.match(/#[\w\u0590-\u05ff]+/gi) || [];
  return [...new Set(matches)];
};

export async function downloadCapCut(inputUrl: string): Promise<unknown> {
  const response = await safeHttp(inputUrl, {
    headers: {
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    },
    timeoutMs: 15000
  });
  if (!response.ok) throw new Error(`Gagal mengakses server CapCut (Status: ${response.status})`);
  const html = await response.text();
  interface LoaderData {
    templateDetail?: Record<string, unknown>;
    recommendList?: Record<string, unknown>[];
    canonicalPath?: string;
    templateId?: string;
  }
  let templateData: Record<string, unknown> | null = null;
  let loaderObj: LoaderData | null = null;

  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  for (const s of scripts) {
    if (s[1].includes("loaderData")) {
      try {
        const parsed = JSON.parse(s[1]) as { loaderData?: Record<string, { templateDetail?: Record<string, unknown>; template_detail?: Record<string, unknown> } | undefined> };
        const entry = (parsed.loaderData?.["template-detail_$"] || parsed.loaderData?.["template_detail"]) as LoaderData | undefined;
        const detail = (entry?.templateDetail || entry) as Record<string, unknown> | undefined;
        if (detail && (detail.templateDetail || detail.videoUrl || detail.templateId)) {
          templateData = (detail.templateDetail || detail) as Record<string, unknown>;
          loaderObj = entry as LoaderData;
          break;
        }
      } catch { /* ignore malformed script blocks */ }
    }
  }

  if (!templateData) {
    const getRegex = (re: RegExp) => html.match(re)?.[1]?.replace(/\\u002F/g, "/") ?? "";
    const getNum = (re: RegExp) => parseInt(html.match(re)?.[1] || "0", 10);

    const videoUrl = getRegex(/"videoUrl":"(.*?)"/);
    if (!videoUrl) throw new Error("Gagal mengekstrak metadata dari URL CapCut");

    const coverUrl = getRegex(/"coverUrl":"(.*?)"/);
    const title = getRegex(/"title":"(.*?)"/);
    const desc = getRegex(/"desc":"(.*?)"/);
    const templateId = getRegex(/"templateId":"(.*?)"/);
    const width = getNum(/"videoWidth":([0-9]+)/);
    const height = getNum(/"videoHeight":([0-9]+)/);
    const duration = getNum(/"templateDuration":([0-9]+)/);
    const createTime = getNum(/"createTime":([0-9]+)/);

    return {
      id: templateId,
      title: title || "CapCut Template",
      description: desc,
      hashtags: extractHashtags(desc),
      cover_url: coverUrl,
      video_url: videoUrl,
      width,
      height,
      ratio: width && height ? `${width}:${height}` : "9:16",
      duration_ms: duration,
      duration_sec: Number((duration / 1000).toFixed(2)),
      usage_count: getNum(/"usageAmount":([0-9]+)/),
      like_count: getNum(/"likeAmount":([0-9]+)/) || getNum(/"likeCount":([0-9]+)/),
      play_count: getNum(/"playAmount":([0-9]+)/) || getNum(/"playCount":([0-9]+)/),
      comment_count: getNum(/"commentAmount":([0-9]+)/),
      created_at: createTime ? new Date(createTime * 1000).toISOString() : "",
      author: {
        name: getRegex(/"author":\{.*?"name":"(.*?)"/),
        avatar_url: getRegex(/"avatarUrl":"(.*?)"/)
      },
      original_url: inputUrl
    };
  }

  const get = <T>(key: string, fallback: T): T => (templateData![key] as T ?? fallback);
  const createTime = Number(templateData.createTime || 0);
  const duration = Number(templateData.templateDuration || 0);
  const desc = String(templateData.desc || "");

  const rawRecommend = Array.isArray(loaderObj?.recommendList) ? loaderObj!.recommendList! : [];
  const recommendList = rawRecommend.map((item) => {
    const rec = item as Record<string, unknown>;
    const author = rec.author as Record<string, string> | undefined;
    const itemCreateTime = Number(rec.createTime || 0);
    const hasAuthor = Boolean(author?.name || author?.avatarUrl || author?.secUid);
    return {
      id: String(rec.templateId || ""),
      title: String(rec.title || ""),
      cover_url: String(rec.coverUrl || ""),
      video_url: rec.videoUrl ? String(rec.videoUrl) : null,
      usage_count: Number(rec.usageAmount || 0),
      like_count: Number(rec.likeAmount || 0),
      created_at: itemCreateTime ? new Date(itemCreateTime * 1000).toISOString() : null,
      author: hasAuthor ? { name: author?.name || null, avatar_url: author?.avatarUrl || null } : null
    };
  });

  const width = Number(templateData.videoWidth || 0);
  const height = Number(templateData.videoHeight || 0);
  const author = templateData.author as Record<string, string> | undefined;

  return {
    id: String(templateData.templateId || loaderObj?.templateId || ""),
    title: String(templateData.title || ""),
    description: desc,
    hashtags: extractHashtags(desc),
    tag_title: get("tagTitle", ""),
    canonical_url: loaderObj?.canonicalPath ? `https://www.capcut.com${loaderObj.canonicalPath}` : "",
    cover_url: get("coverUrl", ""),
    video_url: get("videoUrl", ""),
    width,
    height,
    ratio: get("videoRatio", "") || (width && height ? `${width}:${height}` : "9:16"),
    duration_ms: duration,
    duration_sec: Number((duration / 1000).toFixed(2)),
    segment_count: Number(templateData.segmentAmount || 0),
    usage_count: Number(templateData.usageAmount || 0),
    like_count: Number(templateData.likeAmount || 0),
    play_count: Number(templateData.playAmount || 0),
    comment_count: Number(templateData.commentAmount || 0),
    created_at: createTime ? new Date(createTime * 1000).toISOString() : "",
    capabilities: Array.isArray(templateData.capabilityName) ? templateData.capabilityName : [],
    author: {
      name: author?.name || "",
      avatar_url: author?.avatarUrl || "",
      description: author?.description || "",
      profile_url: author?.profileUrl ? `https://www.capcut.com${author.profileUrl}` : "",
      sec_uid: author?.secUid || ""
    },
    recommend_list: recommendList.length > 0 ? recommendList : [],
    original_url: inputUrl
  };
}

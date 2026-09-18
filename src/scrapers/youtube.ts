// YouTube downloader (MP3/MP4) via the ytmp3.mobi conversion API.
// Ported from the standalone scraper into a bundled, SSRF-safe module.
import { safeHttp, sleep } from "./http.js";

const BASE_URL = "https://a.ymcdn.org/api/v1";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://id.ytmp3.mobi/"
};

export function extractVideoId(url: string): string | null {
  let match: RegExpExecArray | null = null;
  if (url.includes("youtube.com/shorts/") || url.includes("youtu.be/")) {
    match = /\/([a-zA-Z0-9\-_]{11})/.exec(url);
  } else if (url.includes("youtube.com")) {
    match = /v=([a-zA-Z0-9\-_]{11})/.exec(url);
  }
  return match ? match[1] : null;
}

async function initSession(): Promise<{ error: number; convertURL: string }> {
  const url = `${BASE_URL}/init?p=y&23=1llum1n471&_=${Math.random()}`;
  const response = await safeHttp(url, { headers: HEADERS, timeoutMs: 15000 });
  if (!response.ok) throw new Error("Gagal menginisialisasi sesi konversi");
  return response.json();
}

async function startConversion(convertURL: string, videoId: string, format: string): Promise<{ error: number; title?: string; downloadURL?: string; progressURL: string }> {
  const url = `${convertURL}&v=${videoId}&f=${format}&_=${Math.random()}`;
  const response = await safeHttp(url, { headers: HEADERS, timeoutMs: 15000 });
  if (!response.ok) throw new Error("Gagal memulai konversi video");
  return response.json();
}

async function checkProgress(progressURL: string, maxRetries = 30): Promise<void> {
  for (let retries = 0; retries < maxRetries; retries++) {
    const response = await safeHttp(progressURL, { headers: HEADERS, timeoutMs: 10000 });
    if (!response.ok) throw new Error("Gagal memeriksa status proses konversi");
    const data = await response.json<{ error: number; progress: number }>();
    if (data.error !== 0) throw new Error(`Terjadi error pada konversi (Error Code: ${data.error})`);
    if (data.progress === 3) return;
    await sleep(1000);
  }
  throw new Error("Waktu proses konversi melebihi batas (Timeout)");
}

export interface YouTubeResult {
  video_id: string;
  title: string;
  format: string;
  download_url?: string;
  process_time: string;
}

export async function downloadYouTube(rawUrl: string, rawFormat = "mp3"): Promise<YouTubeResult> {
  const format = ["mp3", "mp4"].includes(rawFormat.toLowerCase()) ? rawFormat.toLowerCase() : "mp3";
  const videoId = extractVideoId(rawUrl);
  if (!videoId) throw new Error("URL YouTube tidak valid atau Video ID tidak ditemukan");
  const startTime = Date.now();
  const initData = await initSession();
  if (initData.error !== 0) throw new Error(`Inisialisasi gagal dengan kode: ${initData.error}`);
  const convertData = await startConversion(initData.convertURL, videoId, format);
  if (convertData.error !== 0) throw new Error(`Konversi gagal dengan kode: ${convertData.error}`);
  await checkProgress(convertData.progressURL);
  return {
    video_id: videoId,
    title: convertData.title || "YouTube Media",
    format,
    download_url: convertData.downloadURL,
    process_time: `${((Date.now() - startTime) / 1000).toFixed(2)}s`
  };
}

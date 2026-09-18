import { downloadYouTube } from "../scrapers/youtube.js";
import { extractString, type PluginModule } from "./_shared.js";

const plugin: PluginModule = {
  name: "YouTube Downloader",
  slug: "youtube",
  version: "1.0.0",
  type: "scraper",
  status: "active",
  description: "Download YouTube video as MP3 audio or MP4 video (bundled scraper).",
  inputKind: "url",
  paramExample: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  params: [
    { name: "url", description: "YouTube video or shorts URL" },
    { name: "format", description: "Output format: mp3 or mp4 (default: mp3)" }
  ],
  execute: async (input) => {
    const value = extractString(input);
    if (!value) throw new Error("A public URL is required");
    const record = (input ?? {}) as Record<string, unknown>;
    const format = typeof record.format === "string" ? record.format : "mp3";
    return downloadYouTube(value, format);
  }
};

export default plugin;

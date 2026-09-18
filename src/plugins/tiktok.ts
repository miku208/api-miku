import { extractString, runExternalAdapter, type PluginModule } from "./_shared.js";

const plugin: PluginModule = {
  name: "TikTok Scraper",
  slug: "tiktok",
  version: "1.0.0",
  type: "scraper",
  status: "active",
  description: "Extract public TikTok media links using the existing adapter.",
  inputKind: "url",
  paramExample: "https://www.tiktok.com/@tiktok/video/7106594312292453675",
  params: [{ name: "url", description: "TikTok video URL" }],
  execute: async (input) => {
    const value = extractString(input);
    if (!value) throw new Error("A public URL is required");
    return runExternalAdapter("tiktok.js", value);
  }
};

export default plugin;

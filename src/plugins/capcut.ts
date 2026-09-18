import { downloadCapCut } from "../scrapers/capcut.js";
import { extractString, type PluginModule } from "./_shared.js";

const plugin: PluginModule = {
  name: "CapCut Downloader",
  slug: "capcut",
  version: "1.0.0",
  type: "scraper",
  status: "active",
  description: "Download video template and extract metadata from CapCut (bundled scraper).",
  inputKind: "url",
  paramExample: "https://www.capcut.com/tv2/ZSVEwBgtH/",
  params: [{ name: "url", description: "CapCut template URL" }],
  execute: async (input) => {
    const value = extractString(input);
    if (!value || !value.includes("capcut.com")) throw new Error("URL CapCut tidak valid (contoh: https://www.capcut.com/tv2/ZSVEwBgtH/)");
    return downloadCapCut(value);
  }
};

export default plugin;

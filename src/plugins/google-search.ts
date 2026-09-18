import { extractString, runExternalAdapter, type PluginModule } from "./_shared.js";

const plugin: PluginModule = {
  name: "Google Search",
  slug: "google-search",
  version: "1.0.0",
  type: "scraper",
  status: "active",
  description: "Search the public web through the existing Google adapter.",
  inputKind: "text",
  paramExample: "hatsune miku",
  params: [{ name: "text", description: "Search query" }],
  execute: async (input) => {
    const value = extractString(input);
    if (!value) throw new Error("A search query is required");
    return runExternalAdapter("google.js", value, "GoogleSearch");
  }
};

export default plugin;

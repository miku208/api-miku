import { extractString, runExternalAdapter, type PluginModule } from "./_shared.js";

const plugin: PluginModule = {
  name: "SoundCloud Search",
  slug: "soundcloud",
  version: "1.0.0",
  type: "scraper",
  status: "active",
  description: "Search public SoundCloud tracks through the existing adapter.",
  inputKind: "text",
  paramExample: "the phoenix",
  params: [{ name: "text", description: "Search query" }],
  execute: async (input) => {
    const value = extractString(input);
    if (!value) throw new Error("A search query is required");
    return runExternalAdapter("soundcloud.js", value);
  }
};

export default plugin;

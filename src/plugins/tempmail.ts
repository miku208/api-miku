import { runExternalAdapter, type PluginModule } from "./_shared.js";

const plugin: PluginModule = {
  name: "TempMail Create",
  slug: "tempmail",
  version: "1.0.0",
  type: "scraper",
  status: "active",
  description: "Create a disposable public email address through the existing adapter.",
  inputKind: "none",
  paramExample: "",
  params: [],
  execute: async () => runExternalAdapter("tempmail.js", "", "TempMailCreate")
};

export default plugin;

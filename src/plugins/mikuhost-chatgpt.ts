import { extractString, type PluginModule } from "./_shared.js";

const plugin: PluginModule = {
  name: "MikuHost ChatGPT",
  slug: "mikuhost-chatgpt",
  version: "1.0.0",
  type: "ai",
  status: "tested",
  description: "Text generation proxy for the verified MikuHost ChatGPT endpoint.",
  inputKind: "text",
  paramExample: "Explain what a REST API is in one sentence.",
  params: [{ name: "text", description: "Message text" }],
  execute: async (input) => {
    const text = extractString(input);
    if (!text) throw new Error("Text is required");
    // Server-to-server upstream (never exposed to clients); the response is
    // rebranded by the API layer before it reaches clients.
    const url = `${process.env.MIKUHOST_BASE || "https://api.nexray.eu.cc"}/ai/chatgpt?text=${encodeURIComponent(text)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = (await response.json()) as unknown;
    if (!response.ok) throw new Error(`MikuHost returned HTTP ${response.status}`);
    return body;
  }
};

export default plugin;

import { downloadInstagram } from "../scrapers/instagram.js";
import { extractString, type PluginModule } from "./_shared.js";

const plugin: PluginModule = {
  name: "Instagram Downloader",
  slug: "instagram",
  version: "1.0.0",
  type: "scraper",
  // instashadow.com sits behind a Cloudflare challenge that 403s datacenter
  // IPs; flip to "active" once a working provider is confirmed from this host.
  status: "unavailable",
  description: "Download reels, posts, stories, and profile media from Instagram (bundled scraper; upstream currently Cloudflare-blocked).",
  inputKind: "url",
  paramExample: "https://www.instagram.com/p/CxKvUxKIxgt/",
  params: [{ name: "url", description: "Instagram URL (reels, post, story, or username)" }],
  execute: async (input) => {
    const value = extractString(input);
    if (!value || !value.includes("instagram.com")) throw new Error("Parameter 'url' harus berupa link Instagram yang valid");
    return { url: value, media: await downloadInstagram(value) };
  }
};

export default plugin;

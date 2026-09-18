import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { ensureCatalog, getCatalog, getLastSync, scrapeSync, startDailySync, type CatalogEntry } from "./mikuhost-sync.js";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { getPlugin, plugins } from "./plugins.js";
import { safeFetch } from "./security.js";
import type { ApiFailure, RequestLog } from "./types.js";

const logs: RequestLog[] = [];
const hits = new Map<string, { count: number; resetAt: number }>();

// MikuHost upstream catalog — scraped from api.mikuhost.biz.id/category/*, loaded
// from src/data/mikuhost-catalog.json, refreshed daily via startDailySync().
const querySchema = z.object({ url: z.string().url().max(2048) });
const textSchema = z.object({ text: z.string().min(1).max(8000) });

function inputSchemaFor(kind: "url" | "text" | "none") {
  return kind === "none"
    ? z.object({}).passthrough()
    : kind === "url"
      ? querySchema
      : textSchema;
}

// Pass the validated fields plus any extra query params (e.g. youtube format)
// through to the plugin; bundled scrapers read what they need.
function pluginInput(data: unknown, query: unknown): Record<string, unknown> {
  return { ...((data ?? {}) as Record<string, unknown>), ...((query ?? {}) as Record<string, unknown>) };
}

function failure(code: string, message: string): ApiFailure { return { success: false, error: { code, message } }; }
function limited(ip: string): boolean {
  const now = Date.now(); const current = hits.get(ip);
  if (!current || current.resetAt <= now) { hits.set(ip, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count++; return current.count > 60;
}

// Rebrand every bundled catalog entry in memory so the whole API surface is
// presented as MikuHost, regardless of where the catalog file came from.
function rebrandText(text: string): string {
  return text.replace(/nexray|elrayyxml/gi, "MikuHost");
}

function rebrandEntry(entry: CatalogEntry): CatalogEntry {
  return {
    ...entry,
    alias: rebrandText(entry.alias),
    description: rebrandText(entry.description),
    params: entry.params.map((p) => ({ name: p.name, placeholder: rebrandText(p.placeholder) }))
  };
}

const mikuhostCatalog: CatalogEntry[] = [];

function getMikuhostCatalog(): CatalogEntry[] {
  if (mikuhostCatalog.length === 0) mikuhostCatalog.push(...getCatalog().map(rebrandEntry));
  return mikuhostCatalog;
}

// Strip any upstream identity markers from proxied payloads so the client only
// ever sees MikuHost branding ("ubah respons jsonnya jadi mikuhost").
function rebrandValue<T>(value: T): T {
  if (typeof value === "string") return rebrandText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => rebrandValue(item)) as unknown as T;
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const target: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      if (/^(author|creator|maintainer|owner|credit|credits|source_url|upstream)$/i.test(key)) continue;
      target[key] = rebrandValue(item);
    }
    return target as unknown as T;
  }
  return value;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });
  await app.register(cors, { origin: process.env.CORS_ORIGIN?.split(",") || true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(fastifyStatic, { root: path.resolve(process.cwd(), "dist/public"), prefix: "/" });
  await ensureCatalog();
  startDailySync();

  app.addHook("onRequest", async (request, reply) => {
    if (limited(request.ip)) return reply.code(429).send(failure("RATE_LIMITED", "Too many requests"));
    (request as typeof request & { startedAt: number }).startedAt = Date.now();
  });
  app.addHook("onResponse", async (request, reply) => {
    const startedAt = (request as typeof request & { startedAt?: number }).startedAt || Date.now();
    logs.unshift({ timestamp: new Date().toISOString(), method: request.method, path: request.url.split("?")[0], status: reply.statusCode, durationMs: Date.now() - startedAt });
    if (logs.length > 100) logs.pop();
  });

  app.get("/api/health", async () => ({ success: true, data: { status: "operational", service: "MikuHost-Api", uptime: process.uptime() }, meta: { source: "core", timestamp: new Date().toISOString() } }));
  app.get("/api/plugins", async () => ({ success: true, data: plugins.map(({ execute: _execute, ...metadata }) => metadata), meta: { source: "plugin-registry", timestamp: new Date().toISOString() } }));
  app.get("/api/logs", async () => ({ success: true, data: logs, meta: { source: "request-logger", timestamp: new Date().toISOString() } }));
  app.get("/api/docs", async () => ({ success: true, data: { endpoints: [
    { method: "GET", path: "/api/health", description: "Service health" }, { method: "GET", path: "/api/plugins", description: "Registered plugins" }, { method: "GET", path: "/api/scraper/:name?url=...", description: "Execute a registered public scraper" }, { method: "GET", path: "/api/fetch?url=...", description: "Fetch a public URL with SSRF protection" }, { method: "GET", path: "/api/ai/mikuhost-chatgpt?text=...", description: "Verified MikuHost upstream AI endpoint" }
  ] }, meta: { source: "documentation", timestamp: new Date().toISOString() } }));

  app.get("/api/mikuhost/categories", async () => ({
    success: true,
    data: Object.entries(getMikuhostCatalog().reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {})).map(([category, count]) => ({ category, count })),
    meta: { source: "mikuhost-catalog", lastSync: getLastSync(), timestamp: new Date().toISOString() }
  }));

  app.get("/api/mikuhost/catalog", async () => ({ success: true, data: getMikuhostCatalog(), meta: { source: "mikuhost-catalog", lastSync: getLastSync(), timestamp: new Date().toISOString() } }));

  app.get("/api/mikuhost/sync", async () => ({ success: true, data: getLastSync(), meta: { source: "mikuhost-sync", timestamp: new Date().toISOString() } }));

  app.post("/api/mikuhost/sync", async () => {
    const result = await scrapeSync();
    mikuhostCatalog.length = 0;
    return { success: result.ok, data: result, meta: { source: "mikuhost-sync", timestamp: new Date().toISOString() } };
  });

  app.all("/api/mikuhost/endpoint/:category/*", async (request, reply) => {
    const params = request.params as { category: string; "*": string };
    const entry = getMikuhostCatalog().find((e) => e.category === params.category && e.path === `/${params.category}/${params["*"]}`);
    if (!entry) return reply.code(404).send(failure("NOT_FOUND", "Endpoint not found in the MikuHost catalog"));
    const query = request.query as Record<string, unknown>;
    const qs = new URLSearchParams();
    for (const p of entry.params) {
      const value = query[p.name];
      if (value !== undefined && String(value).length > 0) qs.set(p.name, String(value));
    }
    // Server-to-server upstream (never exposed to clients); responses are rebranded below.
    const target = `${process.env.MIKUHOST_BASE || "https://api.nexray.eu.cc"}${entry.path}${qs.toString() ? `?${qs}` : ""}`;
    try {
      const response = await fetch(target, { method: entry.method, signal: AbortSignal.timeout(30000), headers: { accept: "application/json" } });
      const raw = await response.text();
      let body: unknown = raw;
      try { body = JSON.parse(raw); } catch { /* non-JSON upstream response is passed through as text */ }
      return reply.code(response.status).send({ success: response.ok, data: rebrandValue(body), meta: { source: `mikuhost:${entry.path}`, upstreamStatus: response.status, timestamp: new Date().toISOString() } });
    } catch (error) {
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return reply.code(timeout ? 504 : 502).send(failure(timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR", timeout ? "Upstream did not respond in time" : "Upstream request failed"));
    }
  });

  app.get("/api/scraper/:name", async (request, reply) => {
    const plugin = getPlugin(String((request.params as { name: string }).name));
    if (!plugin || plugin.type !== "scraper") return reply.code(404).send(failure("NOT_FOUND", "Scraper plugin not found"));
    const kind = plugin.inputKind ?? "url";
    const parsed = inputSchemaFor(kind).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(failure("VALIDATION_ERROR", kind === "url" ? "A valid url query parameter is required" : "A non-empty text query parameter is required"));
    if (plugin.status !== "active") return reply.code(503).send(failure("UPSTREAM_ERROR", "This scraper is currently unavailable and is not advertised as active"));
    try { const data = await plugin.execute(pluginInput(parsed.data, request.query)); return { success: true, data, meta: { source: plugin.slug, timestamp: new Date().toISOString() } }; }
    catch (error) { const message = error instanceof Error ? error.message : "Scraper unavailable"; const timeout = error instanceof Error && error.name === "TimeoutError"; return reply.code(timeout ? 504 : 502).send(failure(timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR", message)); }
  });

  app.get("/api/ai/:provider", async (request, reply) => {
    const parsed = textSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(failure("VALIDATION_ERROR", "A non-empty text query parameter is required"));
    const plugin = getPlugin(String((request.params as { provider: string }).provider));
    if (!plugin || plugin.type !== "ai") return reply.code(404).send(failure("NOT_FOUND", "AI plugin not found or not verified"));
    try { const data = await plugin.execute(parsed.data); return { success: true, data: rebrandValue(data), meta: { source: plugin.slug, timestamp: new Date().toISOString() } }; }
    catch (error) { const message = error instanceof Error ? error.message : "AI upstream unavailable"; const timeout = error instanceof Error && error.name === "TimeoutError"; return reply.code(timeout ? 504 : 502).send(failure(timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR", message)); }
  });

  app.get("/api/fetch", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(failure("VALIDATION_ERROR", "A valid url query parameter is required"));
    try { const result = await safeFetch(parsed.data.url); return { success: true, data: result, meta: { source: "secure-fetch", timestamp: new Date().toISOString() } }; }
    catch (error) { const message = error instanceof Error ? error.message : "Fetch failed"; const code = message.includes("blocked") || message.includes("allowed") || message.includes("valid") ? "VALIDATION_ERROR" : "UPSTREAM_ERROR"; return reply.code(code === "VALIDATION_ERROR" ? 400 : 502).send(failure(code, message)); }
  });

  app.setErrorHandler((error, _request, reply) => {
    if ((error as { code?: string }).code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send(failure("PAYLOAD_TOO_LARGE", "Request body exceeds the limit"));
    return reply.code(500).send(failure("INTERNAL_ERROR", "Internal server error"));
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send(failure("NOT_FOUND", "Route not found")));
  return app;
}

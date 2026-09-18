import { useEffect, useMemo, useState } from "react";
import catalogJson from "../data/mikuhost-catalog.json" with { type: "json" };

type CatalogEntry = { category: string; method: string; path: string; alias: string; description: string; params: { name: string; placeholder: string }[] };
type Plugin = { name: string; slug: string; version: string; type: string; endpoint: string; file: string; status: string; description: string; inputKind?: string; paramExample?: string; params?: { name: string; description?: string }[] };
type Log = { timestamp: string; method: string; path: string; status: number; durationMs: number };

const FALLBACK_CATALOG = catalogJson as CatalogEntry[];
const api = async (path: string) => { const r = await fetch(path); return { status: r.status, body: await r.json() }; };

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    void navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return <button type="button" className={`copy-btn${copied ? " copied" : ""}`} onClick={onCopy}>{copied ? "✓ Tersalin" : label}</button>;
}

function curlFor(method: string, path: string): string {
  const base = `${location.origin}${path}`;
  return method === "GET" ? `curl "${base}"` : `curl -X ${method} "${base}"`;
}

export function App() {
  const [route, setRoute] = useState(() => (location.hash.replace(/^#\/?/, "") || "overview"));
  const [catalog, setCatalog] = useState<CatalogEntry[]>(FALLBACK_CATALOG);
  const [lastSync, setLastSync] = useState<any>(null);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [health, setHealth] = useState<any>();
  useEffect(() => {
    const onHash = () => setRoute(location.hash.replace(/^#\/?/, "") || "overview");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    api("/api/plugins").then((x) => setPlugins(x.body.data || []));
    api("/api/health").then((x) => setHealth(x.body.data));
    api("/api/mikuhost/catalog").then((x) => {
      if (Array.isArray(x.body?.data) && x.body.data.length > 0) setCatalog(x.body.data);
      setLastSync(x.body?.meta?.lastSync ?? null);
    });
  }, []);
  useEffect(() => { if (route === "logs") api("/api/logs").then((x) => setLogs(x.body.data || [])); }, [route]);
  const nav = (r: string) => { location.hash = `#/${r}`; setRoute(r); window.scrollTo(0, 0); };

  const categories = useMemo(() => [...new Set(catalog.map((e) => e.category))].sort(), [catalog]);
  const counts = useMemo(() => { const m: Record<string, number> = {}; catalog.forEach((e) => (m[e.category] = (m[e.category] || 0) + 1)); return m; }, [catalog]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand" onClick={() => nav("overview")}><span className="brand-mark">M</span><span>MikuHost<span className="muted">-Api</span></span></div>
        <div className="nav-scroll">
          <div className="nav-label">MENU</div>
          <a className={`nav-item ${route === "overview" ? "active" : ""}`} onClick={() => nav("overview")}><span className="nav-ico">◈</span>Overview</a>
          <a className={`nav-item ${route === "plugins" ? "active" : ""}`} onClick={() => nav("plugins")}><span className="nav-ico">◧</span>Plugins</a>
          <a className={`nav-item ${route === "docs" ? "active" : ""}`} onClick={() => nav("docs")}><span className="nav-ico">⌘</span>Documentation</a>
          <a className={`nav-item ${route === "logs" ? "active" : ""}`} onClick={() => nav("logs")}><span className="nav-ico">≡</span>Logs</a>
          <a className={`nav-item ${route === "settings" ? "active" : ""}`} onClick={() => nav("settings")}><span className="nav-ico">⚙</span>Settings</a>
          <div className="nav-label" style={{ marginTop: 18 }}>CATEGORIES</div>
          {categories.map((c) => (
            <a key={c} className={`nav-item ${route === `cat-${c}` ? "active" : ""}`} onClick={() => nav(`cat-${c}`)}>
              <span className="nav-ico">▸</span><span className="flex1">{c}</span><span className="nav-count">{counts[c]}</span>
            </a>
          ))}
        </div>
        <div className="sidebar-foot">
          <span className="status-dot" /> API operational<br />
          <small>Catalog {catalog.length} endpoints{lastSync?.at ? ` · synced ${new Date(lastSync.at).toLocaleDateString()}` : ""}</small>
        </div>
      </aside>
      <main className="main">
        {route.startsWith("cat-") ? (
          <CategoryPage key={route} category={route.slice(4)} catalog={catalog} />
        ) : route === "plugins" ? (
          <Page title="Plugins" sub={`${plugins.length} registered plugins`}><div className="card-grid">{plugins.map((p) => <PluginCard key={p.slug} p={p} />)}</div></Page>
        ) : route === "docs" ? (
          <Page title="Documentation" sub="Core routes and MikuHost upstream catalog"><CoreDocs /><CatIndex categories={categories} counts={counts} total={catalog.length} /></Page>
        ) : route === "logs" ? (
          <Page title="Logs" sub="In-memory request log (latest first)"><div className="endpoint-list">{logs.length === 0 ? <div className="empty">No requests recorded yet.</div> : logs.map((l, i) => (
            <div className="endpoint-row" key={i}>
              <span className="method-badge">{l.method}</span>
              <div className="row-main"><span className="row-title mono">{l.path}</span><span className="row-desc mono">{new Date(l.timestamp).toLocaleTimeString()}</span></div>
              <span className={`status-chip ${l.status < 400 ? "ok" : "bad"}`}>{l.status}</span>
              <span className="row-desc mono">{l.durationMs}ms</span>
            </div>
          ))}</div></Page>
        ) : route === "settings" ? (
          <Page title="Settings" sub="Phase 1 configuration — no authentication included by design"><div className="endpoint-list">
            {[["Runtime", "Node.js · Fastify · pm2"], ["CORS", "Configured via CORS_ORIGIN"], ["Security", "Helmet · rate limit · SSRF validation"], ["Upstream", "MikuHost catalog via /api/mikuhost/*"], ["Catalog sync", "Daily automatic scrape + POST /api/mikuhost/sync"]].map(([k, v]) => (
              <div className="endpoint-row" key={k}><div className="row-main"><span className="row-title">{k}</span><span className="row-desc mono">{v}</span></div></div>
            ))}
          </div></Page>
        ) : (
          <Overview health={health} plugins={plugins} nav={nav} categories={categories} counts={counts} total={catalog.length} lastSync={lastSync} />
        )}
      </main>
    </div>
  );
}

function Page({ title, sub, children }: { title: string; sub: string; children: any }) {
  return <><header><div><div className="eyebrow">MIKUHOST / CONSOLE</div><h1>{title}</h1></div><div className="header-meta"><span className="live"><span className="status-dot" /> Live</span></div></header><div className="content"><div className="page-sub">{sub}</div>{children}</div></>;
}

function Overview({ health, plugins, nav, categories, counts, total, lastSync }: any) {
  return <><header><div><div className="eyebrow">MIKUHOST / CONSOLE</div><h1>Overview</h1></div><div className="header-meta"><span className="live"><span className="status-dot" /> Live</span></div></header>
    <div className="content">
      <div className="stat-grid">
        <div className="stat"><span>API Status</span><strong className="ok-text">Operational</strong><small>uptime {health ? Math.round(health.uptime) + "s" : "—"}</small></div>
        <div className="stat"><span>Active Plugins</span><strong>{plugins.length}</strong><small>registered modules</small></div>
        <div className="stat"><span>MikuHost Endpoints</span><strong>{total}</strong><small>{lastSync?.at ? `synced ${new Date(lastSync.at).toLocaleString()}` : "bundled catalog"}</small></div>
      </div>
      <div className="section-head"><div><span className="eyebrow">UPSTREAM CATALOG</span><h3>Browse categories</h3></div><button className="text-button" onClick={() => nav("docs")}>Documentation →</button></div>
      <div className="cat-grid">
        {categories.map((c: string) => (
          <div className="cat-card" key={c} onClick={() => nav(`cat-${c}`)}>
            <div className="cat-card-head"><span className="cat-name">{c}</span><span className="nav-count">{counts[c]} endpoints</span></div>
            <p className="cat-desc">Explore {c} related endpoints and features.</p>
            <span className="cat-arrow">→</span>
          </div>
        ))}
      </div>
    </div></>;
}

function PluginCard({ p }: { p: Plugin }) {
  const active = p.status === "active" || p.status === "tested";
  return (
    <div className="endpoint-row">
      <span className="method-badge">{p.type === "ai" ? "AI" : "GET"}</span>
      <div className="row-main">
        <span className="row-title">{p.name} <span className="muted">v{p.version}</span></span>
        <span className="row-desc">{p.description}</span>
        <span className="row-desc mono">{p.endpoint}</span>
        {p.params && p.params.length > 0 && (
          <span className="param-chips">
            {p.params.map((param) => <span className="param-chip mono" key={param.name} title={param.description || param.name}>{param.name}</span>)}
          </span>
        )}
      </div>
      <span className={`status-chip ${active ? "ok" : "bad"}`}>{p.status}</span>
    </div>
  );
}

function CoreDocs() {
  const rows: [string, string, string][] = [
    ["GET", "/api/health", "Service health and uptime"],
    ["GET", "/api/plugins", "List registered plugins"],
    ["GET", "/api/docs", "Machine-readable endpoint list"],
    ["GET", "/api/logs", "Recent request log"],
    ["GET", "/api/fetch?url=…", "SSRF-safe public URL fetch"],
    ["GET", "/api/mikuhost/categories", "MikuHost upstream categories + counts"],
    ["GET", "/api/mikuhost/catalog", "Full catalog (method, path, alias, params)"],
    ["GET", "/api/mikuhost/sync", "Last catalog sync status"],
    ["POST", "/api/mikuhost/sync", "Trigger a catalog re-scrape now"],
    ["ANY", "/api/mikuhost/endpoint/:category/:slug", "Proxy to a MikuHost endpoint, params forwarded 1:1"]
  ];
  const scraperRows: [string, string, string][] = [
    ["GET", "/api/scraper/youtube?url=https://youtu.be/dQw4w9WgXcQ&format=mp4", "YouTube downloader — MP3/MP4 (bundled, format=mp3|mp4)"],
    ["GET", "/api/scraper/capcut?url=https://www.capcut.com/tv2/ZSVEwBgtH/", "CapCut template downloader (bundled)"],
    ["GET", "/api/scraper/tiktok?url=https://www.tiktok.com/@tiktok/video/7106594312292453675", "TikTok downloader"],
    ["GET", "/api/scraper/instagram?url=https://www.instagram.com/instagram/", "Instagram downloader (bundled; upstream saat ini Cloudflare-blocked)"]
  ];
  const samplePath = (p: string) => p.replace(":category", "ai").replace(":slug", "bypass").replace(":name", "google-search").replace("url=…", "url=https://example.com");
  const row = ([m, p, d]: [string, string, string]) => (
    <div className="endpoint-row" key={p}>
      <span className="method-badge">{m}</span>
      <div className="row-main"><span className="row-title mono">{p}</span><span className="row-desc">{d}</span></div>
      <CopyButton label="Salin URL" value={`${location.origin}${samplePath(p)}`} />
      <CopyButton label="Salin cURL" value={curlFor(m === "ANY" ? "GET" : m, samplePath(p))} />
    </div>
  );
  return <>
    <div className="endpoint-list">{rows.map(row)}</div>
    <div className="section-head" style={{ marginTop: 26 }}><div><span className="eyebrow">SCRAPERS</span><h3>Downloader endpoints</h3></div></div>
    <div className="endpoint-list">{scraperRows.map(row)}</div>
  </>;
}

function CatIndex({ categories, counts, total }: { categories: string[]; counts: Record<string, number>; total: number }) {
  return <div className="section-head" style={{ marginTop: 26 }}><div><span className="eyebrow">CATEGORIES</span><h3>{categories.length} categories · {total} endpoints</h3></div></div>;
}

function CategoryPage({ category, catalog }: { category: string; catalog: CatalogEntry[] }) {
  const entries = useMemo(() => catalog.filter((e) => e.category === category), [category, catalog]);
  const [query, setQuery] = useState("");
  const filtered = entries.filter((e) => !query || (e.alias + e.path + e.description).toLowerCase().includes(query.toLowerCase()));
  return (
    <Page title={category} sub={`${entries.length} endpoints · MikuHost API catalog`}>
      <input className="search-input" placeholder={`Search in ${category}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="endpoint-list">
        {filtered.map((e) => <EndpointCard key={e.path} e={e} />)}
        {!filtered.length && <div className="empty">No endpoints match "{query}".</div>}
      </div>
    </Page>
  );
}

function EndpointCard({ e }: { e: CatalogEntry }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);
  const slug = e.path.split("/").filter(Boolean).slice(1).join("/");
  const proxyPath = `/api/mikuhost/endpoint/${e.category}/${slug}`;
  const query = e.params.map((p) => { const v = values[p.name]; return v ? `${p.name}=${encodeURIComponent(v)}` : ""; }).filter(Boolean).join("&");
  const fullUrl = `${location.origin}${proxyPath}${query ? `?${query}` : ""}`;
  const send = async () => {
    setBusy(true);
    const start = Date.now();
    try {
      const r = await fetch(query ? `${proxyPath}?${query}` : proxyPath);
      setResult({ status: r.status, ms: Date.now() - start, body: await r.json() });
    } catch (err) { setResult({ status: 0, ms: Date.now() - start, body: { error: String(err) } }); }
    finally { setBusy(false); }
  };
  return (
    <div className={`endpoint-card ${open ? "open" : ""}`}>
      <button className="endpoint-row card-toggle" onClick={() => setOpen(!open)}>
        <span className="method-badge">{e.method}</span>
        <div className="row-main"><span className="row-title">{e.alias}</span><span className="row-desc mono">{e.path}</span></div>
        <span className="expand-ico">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="endpoint-detail">
          <div className="try-label"><span className="try-ico">▸</span> TRY IT OUT</div>
          <p className="row-desc" style={{ margin: "0 0 14px", whiteSpace: "normal" }}>{e.description || `Execute ${e.alias} via the upstream proxy.`}</p>
          {e.params.length > 0 && <div className="param-block">
            <div className="param-label">Parameters</div>
            {e.params.map((p) => (
              <div className="kv-row" key={p.name}>
                <input className="mono" value={p.name} readOnly />
                <input className="mono" placeholder={p.placeholder || `value of ${p.name}`} value={values[p.name] || ""} onChange={(ev) => setValues({ ...values, [p.name]: ev.target.value })} />
              </div>
            ))}
          </div>}
          <div className="copy-row">
            <CopyButton label="Salin URL" value={fullUrl} />
            <CopyButton label="Salin cURL" value={curlFor(e.method, `${proxyPath}${query ? `?${query}` : ""}`)} />
          </div>
          <div className="action-row">
            <button className="try-button" onClick={send} disabled={busy}>{busy ? "Running…" : "Send request"}</button>
            {result && <CopyButton label="Salin Response" value={JSON.stringify(result.body, null, 2)} />}
          </div>
          {result && (
            <div className="response">
              <div className="response-head"><span>Response</span><b className={result.status >= 200 && result.status < 300 ? "ok" : "bad"}>{result.status} · {result.ms}ms</b></div>
              <pre>{JSON.stringify(result.body, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

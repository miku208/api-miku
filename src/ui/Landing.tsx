import { useEffect, useState } from "react";

type Stat = { label: string; value: string; small: string };

export function Landing({ onEnter }: { onEnter: () => void }) {
  const [health, setHealth] = useState<{ status?: string; uptime?: number } | null>(null);
  const [pluginCount, setPluginCount] = useState<number | null>(null);
  const [catalogCount, setCatalogCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((j) => setHealth(j?.data ?? null)).catch(() => {});
    fetch("/api/plugins").then((r) => r.json()).then((j) => setPluginCount(j?.meta?.loaded ?? j?.data?.length ?? null)).catch(() => {});
    fetch("/api/mikuhost/categories").then((r) => r.json()).then((j) => setCatalogCount(j?.data?.reduce((acc: number, c: { count: number }) => acc + c.count, 0) ?? null)).catch(() => {});
  }, []);

  const stats: Stat[] = [
    { label: "API Status", value: health ? "Operational" : "…", small: health ? `uptime ${Math.round(health.uptime || 0)}s` : "memuat" },
    { label: "Plugin Aktif", value: pluginCount != null ? String(pluginCount) : "…", small: "modular auto-load" },
    { label: "Endpoint Katalog", value: catalogCount != null ? String(catalogCount) : "…", small: "siap dipakai" }
  ];

  const features = [
    { ico: "⬇", title: "Downloader", desc: "YouTube MP3/MP4, CapCut, TikTok — scraper bawaan dengan proteksi SSRF.", hash: "#/plugins" },
    { ico: "✦", title: "AI Endpoint", desc: "ChatGPT & katalog AI siap pakai lewat proxy katalog MikuHost.", hash: "#/cat-ai" },
    { ico: "⌘", title: "Dokumentasi", desc: "Daftar endpoint lengkap dengan tombol salin URL & cURL satu klik.", hash: "#/docs" },
    { ico: "⟳", title: "Katalog Sync", desc: "Katalog upstream di-scrape otomatis tiap hari, siap di-proxy 1:1.", hash: "#/docs" }
  ];

  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden="true" />
      <nav className="landing-nav">
        <div className="brand-row" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <img className="landing-logo" src="/logo.jpg" alt="MikuHost" />
          <span className="brand-name">MikuHost<span className="muted">-Api</span></span>
        </div>
        <div className="nav-actions">
          <a className="ghost-button" href="#/docs">Dokumentasi</a>
          <button className="primary-button" onClick={onEnter}>Buka Dashboard</button>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-badge"><span className="status-dot" /> {health ? "API operational" : "connecting…"}</div>
        <h1>Modular REST API<br /><span className="gradient-text">siap pakai dalam satu platform</span></h1>
        <p className="hero-sub">
          Downloader, AI endpoint, katalog API, dan dashboard — semuanya modular,
          terdokumentasi, dan gratis dipakai. Tanpa API key.
        </p>
        <div className="hero-actions">
          <button className="primary-button big" onClick={onEnter}>Jelajahi API →</button>
          <a className="ghost-button big" href="#/docs">Lihat Dokumentasi</a>
        </div>
        <div className="hero-code">
          <div className="hero-code-head"><span className="dot" /><span className="dot" /><span className="dot" /><span className="hero-code-title">quick start</span></div>
          <pre>{`curl "https://api-mikuhost.biz.id/api/ai/mikuhost-chatgpt?text=Haloo"`}</pre>
        </div>
      </header>

      <section className="landing-stats">
        {stats.map((s) => (
          <div className="landing-stat" key={s.label}>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
            <small>{s.small}</small>
          </div>
        ))}
      </section>

      <section className="features">
        {features.map((f) => (
          <a className="feature-card" href={f.hash} key={f.title} onClick={(e) => { e.preventDefault(); onEnter(); setTimeout(() => { location.hash = f.hash; }, 0); }}>
            <span className="feature-ico">{f.ico}</span>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
            <span className="feature-arrow">→</span>
          </a>
        ))}
      </section>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} MikuHost-Api</span>
        <span className="muted">Node.js · Fastify · pm2 · port 8686 behind nginx</span>
      </footer>
    </div>
  );
}

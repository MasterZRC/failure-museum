import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { api, Health } from "./api";

const navItems = [
  { to: "/", label: "展厅", end: true },
  { to: "/graph", label: "失败图谱" },
  { to: "/curator", label: "问馆长" },
  { to: "/risk", label: "上线前体检" },
  { to: "/ingest", label: "录入失败" },
];

type ConnStatus = "connecting" | "ok" | "down";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");

  useEffect(() => {
    let cancelled = false;
    // The backend is a Vercel serverless function that cold-starts after idle,
    // so the first probe can fail/time out. Retry with backoff before showing
    // a hard "disconnected" state.
    const delays = [0, 1500, 3000, 5000, 8000];

    async function probe() {
      for (let i = 0; i < delays.length; i++) {
        if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
        if (cancelled) return;
        try {
          const h = await api.health();
          if (!cancelled) {
            setHealth(h);
            setStatus("ok");
          }
          return;
        } catch {
          // keep retrying
        }
      }
      if (!cancelled) setStatus("down");
    }

    probe();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-ink-700/80 bg-ink-950/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-6">
          <NavLink to="/" className="flex items-center gap-3 group">
            <span className="text-2xl">🏛️</span>
            <div className="leading-tight">
              <div className="font-serif text-lg text-brass-400 tracking-wide">
                失败博物馆
              </div>
              <div className="text-[11px] text-gray-500 tracking-[0.2em] uppercase">
                Failure Museum
              </div>
            </div>
          </NavLink>

          <nav className="ml-4 flex items-center gap-1">
            {navItems.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-brass-500/15 text-brass-400"
                      : "text-gray-400 hover:text-gray-100 hover:bg-ink-800"
                  }`
                }
              >
                {it.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 text-xs">
            {status === "ok" && health ? (
              <span
                className={`px-2.5 py-1 rounded-full border ${
                  health.llm_enabled
                    ? "border-emerald-500/30 text-emerald-700 bg-emerald-500/10"
                    : "border-amber-500/30 text-amber-700 bg-amber-500/10"
                }`}
                title={`chat: ${health.chat_model} / embed: ${health.embed_model}`}
              >
                {health.llm_enabled ? "AI 已接入" : "降级模式（未配置 Key）"}
              </span>
            ) : status === "connecting" ? (
              <span className="px-2.5 py-1 rounded-full border border-amber-500/30 text-amber-700 bg-amber-500/10 animate-pulse">
                连接中…
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full border border-red-500/30 text-red-700 bg-red-500/10">
                后端未连接
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-ink-800 py-6 text-center text-xs text-gray-600">
        失败不是负资产，未被复用的失败才是 · 收藏教训，不追责个人
      </footer>
    </div>
  );
}

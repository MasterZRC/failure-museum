import { Link } from "react-router-dom";
import { RiskReport } from "../api";

function sevColor(sev: string): string {
  if (["高", "P0", "P1"].includes(sev)) return "text-red-700 border-red-500/40 bg-red-500/10";
  if (["中", "P2"].includes(sev)) return "text-amber-700 border-amber-500/40 bg-amber-500/10";
  return "text-sky-700 border-sky-500/40 bg-sky-500/10";
}

export function RiskReportView({ report }: { report: RiskReport }) {
  const systemic = report.systemic_patterns || [];
  return (
    <div className="space-y-6">
      {/* systemic patterns: "you are repeating an organizational mistake" */}
      {systemic.length > 0 && (
        <section className="rounded-xl border border-red-500/40 bg-red-500/10 p-5">
          <h3 className="font-serif text-lg text-red-700 flex items-center gap-2">
            🧬 你正在重蹈组织覆辙
            <span className="text-xs text-red-700/70 font-sans">
              命中了反复出现的失败模式
            </span>
          </h3>
          <ul className="mt-4 space-y-4">
            {systemic.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-red-500/30 bg-ink-900/40 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-100">【{p.name}】</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-700 border border-red-500/40">
                    已发生 {p.count} 次
                  </span>
                  {p.domains.length > 0 && (
                    <span className="text-xs text-gray-400">
                      横跨 {p.domains.slice(0, 4).join(" / ")}
                    </span>
                  )}
                </div>
                {p.systemic_risk && (
                  <p className="mt-2 text-sm text-gray-300 leading-relaxed">
                    {p.systemic_risk}
                  </p>
                )}
                {p.principle && (
                  <p className="mt-2 text-sm text-brass-300/90">
                    防御原则：{p.principle}
                  </p>
                )}
                <Link
                  to="/graph"
                  className="mt-2 inline-block text-xs text-gray-500 hover:text-brass-400"
                >
                  在失败图谱中查看该模式 →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* matched failures */}
      <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-5">
        <h3 className="font-serif text-lg text-brass-400 flex items-center gap-2">
          🔎 命中的历史失败
          <span className="text-xs text-gray-500 font-sans">
            “这个坑，我们以前踩过”
          </span>
        </h3>
        {report.matched_failures.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">暂无相似历史失败。</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {report.matched_failures.map((m) => (
              <li
                key={m.id}
                className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-900/40 p-3"
              >
                <span className="mt-0.5 shrink-0 px-2 py-0.5 rounded text-xs bg-brass-500/15 text-brass-300 border border-brass-600/40">
                  相似度 {(m.similarity * 100).toFixed(0)}%
                </span>
                <div className="min-w-0">
                  <Link
                    to={`/card/${m.id}`}
                    className="text-gray-100 hover:text-brass-400 font-medium"
                  >
                    {m.title}
                  </Link>
                  {m.why_relevant && (
                    <p className="mt-1 text-sm text-gray-400">{m.why_relevant}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* risk alerts */}
      <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-5">
        <h3 className="font-serif text-lg text-brass-400">⚠️ 风险预警</h3>
        {report.risk_alerts.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">未识别到明确风险。</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {report.risk_alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 shrink-0 px-2 py-0.5 rounded text-xs border ${sevColor(
                    a.severity
                  )}`}
                >
                  {a.severity || "中"}
                </span>
                <div>
                  <span className="text-gray-200">{a.risk}</span>
                  {a.from_title && (
                    <Link
                      to={`/card/${a.from_card}`}
                      className="ml-2 text-xs text-gray-500 hover:text-brass-400"
                    >
                      来源：{a.from_title}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* checklist */}
      <section className="rounded-xl border border-emerald-700/30 bg-emerald-900/10 p-5">
        <h3 className="font-serif text-lg text-emerald-700">✅ 上线前防坑清单</h3>
        <ul className="mt-4 space-y-2">
          {report.pre_launch_checklist.map((c, i) => (
            <li key={i} className="flex items-start gap-3 text-gray-200">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-emerald-500"
              />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* questions */}
      {report.questions_to_think.length > 0 && (
        <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-5">
          <h3 className="font-serif text-lg text-brass-400">🤔 上线前请先想清楚</h3>
          <ul className="mt-4 space-y-2 list-disc list-inside text-gray-300">
            {report.questions_to_think.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-gray-600 text-right">
        {report.llm_used
          ? "由 AI 基于历史失败卡生成，每条均可回溯来源"
          : "降级模式生成（未配置 AI Key），基于检索到的失败卡聚合"}
      </p>
    </div>
  );
}

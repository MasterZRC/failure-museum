import { useState } from "react";
import { Link } from "react-router-dom";
import {
  MatchedFailure,
  RiskReport,
  SystemicPattern,
  streamSSE,
} from "../api";
import { RiskReportView } from "../components/RiskReportView";
import { StreamProgress } from "../components/StreamProgress";

interface Preview {
  matched_failures: MatchedFailure[];
  systemic_patterns: SystemicPattern[];
}

const EXAMPLES = [
  "邀请奖励功能：老用户邀请新用户，双方各得奖励",
  "7 天签到激励：连续签到送积分可兑换礼品",
  "支付成功后异步发放会员权益",
  "首页信息流改为最大化点击率的推荐策略",
];

export default function RiskCheck() {
  const [requirement, setRequirement] = useState("");
  const [context, setContext] = useState("");
  const [report, setReport] = useState<RiskReport | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!requirement.trim() || loading) return;
    setLoading(true);
    setError("");
    setReport(null);
    setPreview(null);
    setStatus("");
    setSteps([]);
    try {
      await streamSSE(
        "/risk-check/stream",
        { requirement, context, top_k: 5 },
        {
          onStatus: (txt) => {
            setStatus((prev) => {
              if (prev && prev !== txt) setSteps((s) => [...s, prev]);
              return txt;
            });
          },
          onMatched: (data) => setPreview(data),
          onDone: (data) => {
            setReport(data as RiskReport);
            setStatus("");
          },
          onError: (msg) => setError(msg),
        },
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-serif text-2xl text-gray-100">上线前体检</h1>
        <p className="mt-2 text-gray-400 max-w-2xl">
          输入一个新需求 / 方案，系统会从失败博物馆里
          <span className="text-brass-400">主动匹配历史相似失败</span>
          ，并生成上线前风险预警与防坑清单 —— 从「事后复盘」升级为「事前防御」。
        </p>
      </section>

      <form onSubmit={run} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">新需求描述</label>
          <textarea
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            rows={3}
            placeholder="例如：做一个邀请奖励功能，老用户邀请新用户，双方各得现金奖励…"
            className="w-full rounded-lg bg-ink-800 border border-ink-700 px-4 py-3 text-gray-100 placeholder:text-gray-600 focus:border-brass-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">
            补充背景（可选）
          </label>
          <input
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="例如：面向新用户拉新，预算有限"
            className="w-full rounded-lg bg-ink-800 border border-ink-700 px-4 py-2.5 text-gray-100 placeholder:text-gray-600 focus:border-brass-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={loading || !requirement.trim()}
            className="px-6 py-2.5 rounded-lg bg-brass-500 text-ink-950 font-medium hover:bg-brass-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            开始体检
          </button>
          <span className="text-xs text-gray-600">试试：</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setRequirement(ex)}
              className="text-xs px-3 py-1.5 rounded-full border border-ink-700 text-gray-400 hover:text-brass-300 hover:border-brass-600/50"
            >
              {ex.split("：")[0]}
            </button>
          ))}
        </div>
      </form>

      {/* live progress while the report is still generating */}
      {loading && !report && (status || steps.length > 0) && (
        <div className="rounded-xl border border-ink-700 bg-ink-800/40 p-5">
          <StreamProgress steps={steps} active={status} />
        </div>
      )}

      {/* instant no-LLM preview: matched failures + systemic patterns */}
      {!report && preview && (
        <RiskPreview preview={preview} />
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-700 text-sm">
          体检失败：{error}
        </div>
      )}

      {report && <RiskReportView report={report} />}
    </div>
  );
}

function RiskPreview({ preview }: { preview: Preview }) {
  const systemic = preview.systemic_patterns || [];
  return (
    <div className="space-y-6">
      {systemic.length > 0 && (
        <section className="rounded-xl border border-red-500/40 bg-red-500/10 p-5">
          <h3 className="font-serif text-lg text-red-700 flex items-center gap-2">
            🧬 你正在重蹈组织覆辙
            <span className="text-xs text-red-700/70 font-sans">
              命中了反复出现的失败模式
            </span>
          </h3>
          <ul className="mt-4 space-y-2">
            {systemic.map((p) => (
              <li key={p.id} className="text-sm text-gray-200">
                <span className="font-medium text-gray-100">【{p.name}】</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-700 border border-red-500/40">
                  已发生 {p.count} 次
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-ink-700 bg-ink-800/50 p-5">
        <h3 className="font-serif text-lg text-brass-400 flex items-center gap-2">
          🔎 命中的历史失败
          <span className="text-xs text-gray-500 font-sans">“这个坑，我们以前踩过”</span>
        </h3>
        <ul className="mt-4 space-y-3">
          {preview.matched_failures.map((m) => (
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
      </section>

      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="h-3.5 w-3.5 rounded-full border-2 border-brass-500/40 border-t-brass-400 animate-spin" />
        正在生成风险预警与上线前防坑清单…
      </div>
    </div>
  );
}

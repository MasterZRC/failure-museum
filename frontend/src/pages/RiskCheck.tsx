import { useState } from "react";
import { api, RiskReport } from "../api";
import { RiskReportView } from "../components/RiskReportView";
import { Spinner } from "../components/Spinner";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!requirement.trim()) return;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const res = await api.riskCheck(requirement, context, 5);
      setReport(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
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

      {loading && (
        <div className="rounded-xl border border-ink-700 bg-ink-800/40 p-6">
          <Spinner label="正在询问历史失败… 匹配相似坑、生成风险清单" />
        </div>
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, FailureCard } from "../api";
import { Spinner } from "../components/Spinner";

const SAMPLE = `上周做的拉新红包活动，用户首次绑定手机号就能领 5 元。上线当晚成本就超了预算，发现有人用接码平台批量注册账号来薅，单个设备领了几十次。我们没做设备维度的限制，领取接口也能重复调用。最后紧急下线，加了设备指纹和频控才重新上。`;

function Field({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-lg bg-ink-800 border border-ink-700 px-3 py-2 text-sm text-gray-100 focus:border-brass-600 focus:outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg bg-ink-800 border border-ink-700 px-3 py-2 text-sm text-gray-100 focus:border-brass-600 focus:outline-none"
        />
      )}
    </label>
  );
}

function ListField({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <Field
      label={`${label}（每行一条）`}
      value={items.join("\n")}
      onChange={(v) => onChange(v.split("\n").map((s) => s.trim()).filter(Boolean))}
      textarea
    />
  );
}

export default function Ingest() {
  const navigate = useNavigate();
  const [raw, setRaw] = useState("");
  const [draft, setDraft] = useState<FailureCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (!raw.trim()) return;
    setLoading(true);
    setError("");
    try {
      const card = await api.ingestDraft(raw, "pasted-text");
      setDraft(card);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const saved = await api.createCard(draft);
      navigate(`/card/${saved.id}`);
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  }

  function upd(patch: Partial<FailureCard>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-serif text-2xl text-gray-100">录入一条失败</h1>
        <p className="mt-2 text-gray-400 max-w-2xl">
          把复盘、群聊、事故记录原文粘进来，AI 会自动结构化成「失败卡」草稿（已脱敏、根因落到机制）。
          你确认 / 修改后再发布入馆。
        </p>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* raw input */}
        <div className="space-y-3">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={12}
            placeholder="粘贴失败的原始描述…"
            className="w-full rounded-lg bg-ink-800 border border-ink-700 px-4 py-3 text-gray-100 placeholder:text-gray-600 focus:border-brass-600 focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={generate}
              disabled={loading || !raw.trim()}
              className="px-5 py-2.5 rounded-lg bg-brass-500 text-ink-950 font-medium hover:bg-brass-400 disabled:opacity-40 transition-colors"
            >
              AI 生成失败卡草稿
            </button>
            <button
              onClick={() => setRaw(SAMPLE)}
              className="text-sm text-gray-500 hover:text-brass-300"
            >
              填入示例
            </button>
          </div>
          {loading && <Spinner label="正在结构化…" />}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>

        {/* draft editor */}
        <div className="rounded-xl border border-ink-700 bg-ink-800/40 p-5">
          {!draft ? (
            <p className="text-sm text-gray-500">
              生成后，结构化草稿会出现在这里，可逐字段编辑确认。
            </p>
          ) : (
            <div className="space-y-3">
              <Field label="标题" value={draft.title} onChange={(v) => upd({ title: v })} />
              <Field
                label="一句话教训"
                value={draft.one_line}
                onChange={(v) => upd({ one_line: v })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="场景"
                  value={draft.scenario}
                  onChange={(v) => upd({ scenario: v })}
                />
                <Field
                  label="严重级别"
                  value={draft.severity}
                  onChange={(v) => upd({ severity: v })}
                />
              </div>
              <ListField
                label="标签"
                items={draft.tags}
                onChange={(v) => upd({ tags: v })}
              />
              <Field
                label="根因（机制层面）"
                value={draft.root_cause}
                onChange={(v) => upd({ root_cause: v })}
                textarea
              />
              <ListField
                label="预警信号"
                items={draft.warning_signals}
                onChange={(v) => upd({ warning_signals: v })}
              />
              <ListField
                label="防坑清单"
                items={draft.checklist}
                onChange={(v) => upd({ checklist: v })}
              />
              <button
                onClick={publish}
                disabled={saving}
                className="w-full mt-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-40 transition-colors"
              >
                {saving ? "发布中…" : "确认并入馆"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, clusterColor, FailureCard, FailurePattern, GraphNode } from "../api";
import { SeverityBadge, TagBadge } from "../components/TagBadge";
import { Spinner } from "../components/Spinner";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800/50 p-5">
      <h3 className="text-sm uppercase tracking-wider text-brass-400/80">
        {title}
      </h3>
      <div className="mt-2 text-gray-200 leading-relaxed">{children}</div>
    </div>
  );
}

function BulletList({ items, accent }: { items: string[]; accent: string }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className={`mt-2 h-1.5 w-1.5 rounded-full shrink-0 ${accent}`} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CardDetail() {
  const { id } = useParams();
  const [card, setCard] = useState<FailureCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pattern, setPattern] = useState<FailurePattern | null>(null);
  const [siblings, setSiblings] = useState<GraphNode[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getCard(id)
      .then(setCard)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setPattern(null);
    setSiblings([]);
    api
      .graph()
      .then((g) => {
        const p = g.patterns.find((x) => x.member_ids.includes(id));
        if (!p) return;
        setPattern(p);
        const others = new Set(p.member_ids.filter((m) => m !== id));
        setSiblings(g.nodes.filter((n) => others.has(n.id)));
      })
      .catch(() => {});
  }, [id]);

  if (loading) return <Spinner label="正在取出展品…" />;
  if (notFound || !card)
    return (
      <div className="text-gray-400">
        未找到该失败卡。<Link to="/" className="text-brass-400">返回展厅</Link>
      </div>
    );

  return (
    <article className="space-y-6">
      <Link to="/" className="text-sm text-gray-500 hover:text-brass-400">
        ← 返回展厅
      </Link>

      <header className="rounded-2xl border border-ink-700 bg-gradient-to-br from-ink-800/80 to-ink-900/40 p-7 card-shadow">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-brass-400">{card.scenario || "未分类"}</span>
          <SeverityBadge severity={card.severity} />
          {card.anonymized && (
            <span className="text-xs text-gray-500 border border-ink-600 rounded-full px-2 py-0.5">
              已脱敏 · 不追责个人
            </span>
          )}
        </div>
        <h1 className="mt-3 font-serif text-2xl text-gray-100">{card.title}</h1>
        <p className="mt-2 text-brass-300/90 text-lg">{card.one_line}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {card.tags.map((t) => (
            <TagBadge key={t}>{t}</TagBadge>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
          {card.happened_at && <span>发生时间：{card.happened_at}</span>}
          {card.owner_team && <span>团队：{card.owner_team}</span>}
          {card.source_type && <span>来源：{card.source_type}</span>}
          {card.tech_domains.length > 0 && (
            <span>技术域：{card.tech_domains.join(" / ")}</span>
          )}
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-5">
        {card.context && <Section title="背景">{card.context}</Section>}
        {card.what_happened && (
          <Section title="失败经过">{card.what_happened}</Section>
        )}
      </div>

      {card.root_cause && (
        <Section title="根因（机制层面）">
          <p className="text-red-700/90">{card.root_cause}</p>
        </Section>
      )}

      {card.impact && <Section title="影响">{card.impact}</Section>}

      <div className="grid md:grid-cols-2 gap-5">
        {card.warning_signals.length > 0 && (
          <Section title="预警信号">
            <BulletList items={card.warning_signals} accent="bg-amber-400" />
          </Section>
        )}
        {card.checklist.length > 0 && (
          <div className="rounded-xl border border-emerald-700/30 bg-emerald-900/10 p-5">
            <h3 className="text-sm uppercase tracking-wider text-emerald-700/90">
              防坑清单
            </h3>
            <div className="mt-2 text-gray-200">
              <BulletList items={card.checklist} accent="bg-emerald-400" />
            </div>
          </div>
        )}
      </div>

      {card.resolution && (
        <Section title="当时如何解决">{card.resolution}</Section>
      )}

      {pattern && siblings.length > 0 && (
        <div className="rounded-xl border border-ink-700 bg-ink-800/50 p-5">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ background: clusterColor(pattern.id) }}
            />
            <h3 className="text-sm uppercase tracking-wider text-brass-400/80">
              同模式的其他失败 · {pattern.name}
            </h3>
            <Link
              to="/graph"
              className="ml-auto text-xs text-gray-500 hover:text-brass-400"
            >
              在图谱中查看 →
            </Link>
          </div>
          {pattern.systemic_risk && (
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              {pattern.systemic_risk}
            </p>
          )}
          <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
            {siblings.map((s) => (
              <Link
                key={s.id}
                to={`/card/${s.id}`}
                className="block rounded-lg border border-ink-700 bg-ink-900/40 p-3 hover:border-brass-600/50"
              >
                <div className="text-sm text-gray-100">{s.title}</div>
                <div className="mt-1 text-xs text-gray-500 line-clamp-1">
                  {s.one_line}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

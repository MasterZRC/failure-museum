import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, FailureCard, SearchHit, Stats } from "../api";
import { CardTile } from "../components/CardTile";
import { Spinner } from "../components/Spinner";

export default function Gallery() {
  const [cards, setCards] = useState<FailureCard[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState<string>("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [patternCount, setPatternCount] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([api.listCards(), api.stats()])
      .then(([c, s]) => {
        setCards(c);
        setStats(s);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api
      .graph()
      .then((g) => setPatternCount(g.patterns.length))
      .catch(() => {});
  }, []);

  const scenarios = useMemo(
    () => Object.entries(stats?.by_scenario || {}).sort((a, b) => b[1] - a[1]),
    [stats]
  );

  const visible = useMemo(() => {
    if (hits) return hits.map((h) => h.card);
    if (!scenario) return cards;
    return cards.filter((c) => (c.scenario || "未分类") === scenario);
  }, [cards, scenario, hits]);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) {
      setHits(null);
      return;
    }
    setSearching(true);
    try {
      const res = await api.search(query, 12);
      setHits(res);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setHits(null);
  }

  return (
    <div className="space-y-8">
      {/* hero */}
      <section className="rounded-2xl border border-ink-700 bg-gradient-to-br from-ink-800/80 to-ink-900/40 p-8 card-shadow">
        <h1 className="font-serif text-3xl text-gray-100">
          成功被展示，<span className="text-brass-400">失败</span>却最容易流失
        </h1>
        <p className="mt-3 max-w-2xl text-gray-400 leading-relaxed">
          把碎片化的失败经历沉淀成可检索、可命中、可预警的组织资产。
          下一次类似需求出现时，让历史失败主动提醒团队。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/risk"
            className="px-5 py-2.5 rounded-lg bg-brass-500 text-ink-950 font-medium hover:bg-brass-400 transition-colors"
          >
            上线前体检 →
          </Link>
          <Link
            to="/ingest"
            className="px-5 py-2.5 rounded-lg border border-ink-600 text-gray-200 hover:bg-ink-800 transition-colors"
          >
            录入一条失败
          </Link>
        </div>

        {stats && (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <Stat label="馆藏失败卡" value={stats.total} />
            <Stat label="覆盖场景" value={Object.keys(stats.by_scenario).length} />
            <Link to="/graph" className="block group">
              <div className="rounded-xl border border-ink-700 bg-ink-900/40 px-4 py-3 group-hover:border-brass-600/50 transition-colors">
                <div className="text-2xl font-serif text-brass-400">
                  {patternCount ?? "—"}
                </div>
                <div className="text-xs text-gray-500 mt-1 group-hover:text-brass-300">
                  失败模式 →
                </div>
              </div>
            </Link>
            <Stat label="失败模式标签" value={stats.top_tags.length} />
            <Stat
              label="P0/P1 高危"
              value={
                (stats.by_severity["P0"] || 0) + (stats.by_severity["P1"] || 0)
              }
            />
          </div>
        )}
      </section>

      {/* search */}
      <form onSubmit={runSearch} className="flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="语义搜索失败卡，例如：奖励发放被刷、回调重复、缓存不一致…"
          className="flex-1 rounded-lg bg-ink-800 border border-ink-700 px-4 py-2.5 text-gray-100 placeholder:text-gray-600 focus:border-brass-600 focus:outline-none"
        />
        <button
          type="submit"
          className="px-5 rounded-lg bg-ink-700 hover:bg-ink-600 text-gray-100"
        >
          搜索
        </button>
        {hits && (
          <button
            type="button"
            onClick={clearSearch}
            className="px-4 rounded-lg border border-ink-700 text-gray-400 hover:text-gray-100"
          >
            清除
          </button>
        )}
      </form>

      {/* scenario filter */}
      {!hits && scenarios.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Chip active={scenario === ""} onClick={() => setScenario("")}>
            全部 ({cards.length})
          </Chip>
          {scenarios.map(([name, count]) => (
            <Chip
              key={name}
              active={scenario === name}
              onClick={() => setScenario(name)}
            >
              {name} ({count})
            </Chip>
          ))}
        </div>
      )}

      {/* gallery grid */}
      {loading ? (
        <Spinner label="正在加载馆藏…" />
      ) : searching ? (
        <Spinner label="语义检索中…" />
      ) : visible.length === 0 ? (
        <p className="text-gray-500">暂无失败卡，去「录入失败」添加第一条吧。</p>
      ) : (
        <>
          {hits && (
            <p className="text-sm text-gray-500">
              按语义相关度排序，命中 {hits.length} 条
            </p>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/40 px-4 py-3">
      <div className="text-2xl font-serif text-brass-400">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
        active
          ? "bg-brass-500/15 text-brass-300 border-brass-600/50"
          : "border-ink-700 text-gray-400 hover:text-gray-100 hover:bg-ink-800"
      }`}
    >
      {children}
    </button>
  );
}

import { Link } from "react-router-dom";
import { FailureCard } from "../api";
import { SeverityBadge, TagBadge } from "./TagBadge";

export function CardTile({ card }: { card: FailureCard }) {
  return (
    <Link
      to={`/card/${card.id}`}
      className="group block rounded-xl border border-ink-700 bg-ink-800/60 hover:bg-ink-800 hover:border-brass-600/50 transition-all card-shadow frame p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs text-brass-400/90">{card.scenario || "未分类"}</span>
        <SeverityBadge severity={card.severity} />
      </div>
      <h3 className="mt-2 font-serif text-[17px] leading-snug text-gray-100 group-hover:text-brass-500">
        {card.title}
      </h3>
      <p className="mt-2 text-sm text-gray-400 line-clamp-2">{card.one_line}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {card.tags.slice(0, 4).map((t) => (
          <TagBadge key={t}>{t}</TagBadge>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span>{card.happened_at || "—"}</span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-brass-400">
          查看教训 →
        </span>
      </div>
    </Link>
  );
}

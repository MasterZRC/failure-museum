export function TagBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-ink-700/70 text-gray-300 border border-ink-600">
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  if (!severity) return null;
  const map: Record<string, string> = {
    P0: "bg-red-500/15 text-red-700 border-red-500/30",
    P1: "bg-orange-500/15 text-orange-700 border-orange-500/30",
    P2: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
    P3: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  };
  const cls = map[severity] || "bg-ink-700 text-gray-300 border-ink-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {severity}
    </span>
  );
}

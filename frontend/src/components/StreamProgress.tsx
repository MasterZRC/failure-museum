/**
 * Live progress indicator for streaming flows. Shows completed steps with a
 * check, and the currently-active step with a spinner, so the UI never looks
 * frozen while the model is working.
 */
export function StreamProgress({
  steps = [],
  active,
}: {
  steps?: string[];
  active?: string;
}) {
  if (steps.length === 0 && !active) return null;
  return (
    <div className="space-y-1.5 text-sm">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-gray-500">
          <span className="text-emerald-500">✓</span>
          <span>{s}</span>
        </div>
      ))}
      {active && (
        <div className="flex items-center gap-2 text-gray-300">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-brass-500/40 border-t-brass-400 animate-spin" />
          <span>{active}</span>
        </div>
      )}
    </div>
  );
}

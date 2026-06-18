export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-gray-400 text-sm">
      <span className="h-4 w-4 rounded-full border-2 border-brass-500/40 border-t-brass-400 animate-spin" />
      {label}
    </div>
  );
}

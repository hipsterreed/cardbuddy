// Pure-CSS Poké Ball — used as the loading spinner and a header mark.
export function PokeBall({
  className = "",
  spinning = false,
}: {
  className?: string;
  spinning?: boolean;
}) {
  return (
    <div
      className={`relative aspect-square overflow-hidden rounded-full border-[3px] border-zinc-900 shadow-sm ${
        spinning ? "animate-spin" : ""
      } ${className}`}
    >
      <div className="absolute inset-x-0 top-0 h-1/2 bg-[#EE1515]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-white" />
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-zinc-900" />
      <div className="absolute left-1/2 top-1/2 h-[30%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-zinc-900 bg-white" />
    </div>
  );
}

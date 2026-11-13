/** The big countdown that sits on top of a timed work surface. */
export function StageClock({
  label,
  seconds,
  unit,
  state,
}: {
  label: string
  seconds: number
  unit: string
  state: "idle" | "live" | "done"
}) {
  return (
    <div
      className={`sticky top-24 z-10 flex items-center justify-between gap-4 rounded-xl border px-4 py-2 ${
        state === "done" ? "border-stamp bg-[#f6ded9]" : state === "live" ? "border-[#e8c9c3] bg-[#fbf7ee]/95" : "border-[#d9d0c0] bg-[#fbf7ee]/95"
      }`}
    >
      <p className={`flex items-center gap-2 font-mono text-xs tracking-[0.16em] ${state === "idle" ? "text-muted-foreground" : "text-stamp"}`}>
        {state === "live" ? <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-stamp" /> : null}
        {label}
      </p>
      <p className={`font-serif leading-none tabular-nums ${state === "idle" ? "text-muted-foreground" : "text-stamp"}`} aria-live={state === "live" ? "off" : "polite"}>
        <span className="text-6xl">{seconds}</span>
        <span className="ml-1 text-base">{unit}</span>
      </p>
    </div>
  )
}

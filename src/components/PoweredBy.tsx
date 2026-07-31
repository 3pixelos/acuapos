/**
 * "Powered by 2AM Studio" credit.
 *
 * Set in type rather than a traced copy of the logo: at the ~14px this
 * renders at, a faithful trace turns to mush, while type stays crisp on
 * every screen and print. The logo's signature four-point sparkle sits
 * between the A and the M, as in the brand mark.
 */
export function PoweredBy({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center gap-2.5 select-none ${className}`}
      aria-label="Powered by 2AM Studio"
    >
      <span className="text-[9.5px] font-medium tracking-[0.2em] text-ink-3 uppercase opacity-60">
        Powered by
      </span>
      <span className="flex items-baseline gap-[3px] text-ink-2">
        <span className="font-serif text-[17px] leading-none font-medium italic">2</span>
        <span className="text-[15px] leading-none font-extrabold tracking-tight">A</span>
        <Sparkle className="size-[7px] self-center opacity-90" />
        <span className="text-[15px] leading-none font-extrabold tracking-tight">M</span>
        <span className="ml-1 text-[8.5px] leading-none font-bold tracking-[0.32em] opacity-55">
          STUDIO
        </span>
      </span>
    </div>
  )
}

/** Four-point sparkle from the 2AM mark. */
function Sparkle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0c.5 4.6 3.4 7.5 8 8-4.6.5-7.5 3.4-8 8-.5-4.6-3.4-7.5-8-8 4.6-.5 7.5-3.4 8-8Z" />
    </svg>
  )
}

/** Acua wordmark (teal "ACUA" + optional pink "CAFÉ · RESTAURANT · LOUNGE").
 * Inline SVG so it stays crisp at any size and needs no network request.
 * Mirrors branding/acua-logo.svg. */
export function AcuaLogo({
  withTagline = false,
  className,
}: {
  withTagline?: boolean
  className?: string
}) {
  return (
    <svg
      viewBox={withTagline ? '0 0 512 420' : '0 0 512 190'}
      className={className}
      role="img"
      aria-label="Acua"
    >
      <g
        transform={`translate(256 ${withTagline ? 248 : 95}) scale(0.86) translate(-256 -256)`}
        fill="none"
        stroke="#22b3c6"
        strokeWidth={21}
        strokeLinejoin="miter"
      >
        <path d="M64 336 L104 176 L144 336 M78 282 L130 282" />
        <path d="M250 200 A68 78 0 1 0 250 312" strokeLinecap="round" />
        <path d="M282 176 L282 292 A43 43 0 0 0 368 292 L368 176" strokeLinecap="round" />
        <path d="M392 336 L432 176 L472 336 M406 282 L458 282" />
      </g>
      {withTagline && (
        <text
          x="256"
          y="372"
          fontFamily="Inter, 'Helvetica Neue', Arial, sans-serif"
          fontSize="21"
          fontWeight="600"
          letterSpacing="5"
          fill="#e389ae"
          textAnchor="middle"
        >
          CAFÉ · RESTAURANT · LOUNGE
        </text>
      )}
    </svg>
  )
}

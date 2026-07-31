/**
 * Minimal ESC/POS receipt builder → raw bytes for a network thermal printer.
 * Covers exactly what our kitchen tickets and bills need: init, code page
 * (Latin-1 so accents print), alignment, bold, double size, feed and a full
 * paper cut. No external plugin — full control over the cut command.
 */
export class EscPos {
  private parts: number[] = []

  constructor() {
    this.raw(0x1b, 0x40) // ESC @  — initialize / reset
    this.raw(0x1b, 0x74, 0x10) // ESC t 16 — code page WPC1252 (Latin-1 accents)
  }

  private raw(...bytes: number[]) {
    this.parts.push(...bytes)
    return this
  }

  /** Encode text as CP1252 so é/è/à/ç print correctly on the roll. */
  text(s: string) {
    for (const ch of s) {
      const code = cp1252(ch)
      this.parts.push(code)
    }
    return this
  }

  line(s = '') {
    return this.text(s).raw(0x0a)
  }

  align(a: 'left' | 'center' | 'right') {
    return this.raw(0x1b, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0)
  }

  bold(on: boolean) {
    return this.raw(0x1b, 0x45, on ? 1 : 0)
  }

  /** GS ! n — width/height multiplier (0 = normal, 1 = double). */
  size(w: 0 | 1, h: 0 | 1) {
    return this.raw(0x1d, 0x21, (w << 4) | h)
  }

  feed(n = 1) {
    return this.raw(0x1b, 0x64, n) // ESC d n
  }

  /** GS B n — white-on-black band, used for the ticket header. */
  invert(on: boolean) {
    return this.raw(0x1d, 0x42, on ? 1 : 0)
  }

  /** Dashed rule across the roll (chars, not a graphic — cheap + universal). */
  rule(width = 42) {
    return this.line('-'.repeat(width))
  }

  /** GS v 0 — print a packed 1-bit raster (MSB-first rows). Respects the
   * current alignment on Epson-compatible printers, so center() works. */
  image(packed: Uint8Array, width: number, height: number) {
    const bpr = Math.ceil(width / 8)
    this.raw(0x1d, 0x76, 0x30, 0x00, bpr & 0xff, (bpr >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff)
    for (const b of packed) this.parts.push(b)
    return this
  }

  cut() {
    // feed a few lines so the content clears the cutter, then full cut
    return this.feed(4).raw(0x1d, 0x56, 0x00) // GS V 0
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.parts)
  }
}

// Map a character to its CP1252 byte; unknown chars fall back to '?'.
function cp1252(ch: string): number {
  const code = ch.codePointAt(0) ?? 0x3f
  if (code <= 0xff) return code // Latin-1 range matches CP1252 for our accents
  // A few common Windows-1252 high glyphs we might hit
  const map: Record<number, number> = {
    0x20ac: 0x80, // €
    0x2019: 0x27, // ’ -> '
    0x2018: 0x27, // ‘ -> '
    0x201c: 0x22, // “ -> "
    0x201d: 0x22, // ” -> "
    0x2013: 0x2d, // – -> -
    0x2014: 0x2d, // — -> -
    0x2026: 0x2e, // … -> .
    0xd7: 0x78, // × -> x
  }
  return map[code] ?? 0x3f
}

/** Left/right two-column line padded to `width` (for "2x Item ....... 90 DH"). */
export function lr(left: string, right: string, width = 42): string {
  const l = left.length + right.length > width ? left.slice(0, width - right.length - 1) : left
  const gap = Math.max(1, width - l.length - right.length)
  return l + ' '.repeat(gap) + right
}

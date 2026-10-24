import type { CSSProperties } from 'react'

/** Truyền giá trị động vào CSS qua custom properties: cssVars({ '--x': '10%' }). */
export function cssVars(vars: Record<`--${string}`, string | number>): CSSProperties {
  return vars as CSSProperties
}

/** Ghép class, bỏ qua giá trị falsy. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}

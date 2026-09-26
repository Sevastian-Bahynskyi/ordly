/**
 * Plural forms for interface text (issue #24). English has two; Russian and Ukrainian choose
 * between three by the number's last digits (1 слово, 2 слова, 5 слів; 11 слів, 21 слово).
 */
export function englishPlural(count: number, one: string, other: string): string {
  return count === 1 ? one : other
}

export function slavicPlural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.trunc(count))
  const lastTwo = n % 100
  const last = n % 10
  if (lastTwo >= 11 && lastTwo <= 14) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

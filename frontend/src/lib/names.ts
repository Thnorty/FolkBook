/** "Emma Yılmaz" → "EY", "Ela" → "E". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? [words[0], words.at(-1)!] : words
  return letters.map((word) => word[0].toLocaleUpperCase()).join('')
}

/** For matching what someone types, ignoring case and accents: "Ayşe" → "ayse". */
export function fold(text: string): string {
  return text.replaceAll('ı', 'i').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
}

/** "a", "a and b", "a, b and c"; nothing for none. */
export function words(parts: (string | false)[]): string {
  const kept = parts.filter((part): part is string => Boolean(part))
  return kept.length > 1 ? `${kept.slice(0, -1).join(', ')} and ${kept.at(-1)}` : (kept[0] ?? '')
}

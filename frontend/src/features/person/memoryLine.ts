/** A sentence ends at a line break, or at . ! ? followed by a space. */
const SENTENCE_BREAK = /(?<=[.!?])[ \t]+|\n+/g

/**
 * The words to put on a sticky note from a note being written: what's selected, or else
 * the sentence the cursor is in. "Arda's into dinosaurs." becomes "Arda's into dinosaurs".
 */
export function memoryLine(text: string, selectionStart: number, selectionEnd: number): string {
  if (selectionEnd > selectionStart) return tidy(text.slice(selectionStart, selectionEnd))
  let start = 0
  for (const match of text.matchAll(SENTENCE_BREAK)) {
    if (selectionStart <= match.index) return tidy(text.slice(start, match.index))
    start = match.index + match[0].length
  }
  return tidy(text.slice(start))
}

function tidy(line: string): string {
  return line.trim().replace(/(?<!\.)\.$/, '') // a full stop, but not an ellipsis
}

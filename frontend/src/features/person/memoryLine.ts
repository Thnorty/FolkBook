/**
 * The words to put on a sticky note: what's selected in the note being written, tidied.
 * "Arda's into dinosaurs." becomes "Arda's into dinosaurs". Nothing selected gives "".
 */
export function memoryLine(text: string, selectionStart: number, selectionEnd: number): string {
  return text
    .slice(selectionStart, selectionEnd)
    .trim()
    .replace(/(?<!\.)\.$/, '') // a full stop, but not an ellipsis
}

import { relationLabel } from '@/features/person/labels'
import type { Shortcut } from '@/lib/shortcuts'
import type { ChangeField } from './review'

/* The words Quick capture uses (screens 2d–2j), and its key. */

/** Suggest, from the text box too. */
export const SUGGEST: Shortcut = { key: 'Enter', mod: true }

export const HINT = "Write like you'd tell a friend. Nothing is saved until you review it."

/** Inserted at the cursor, to get started. */
export const PHRASES = ['Coffee with …', "… is …'s sister", 'Met … at …']

export const AI_OFF = {
  title: 'Quick capture needs an AI key of your own.',
  body: 'Add a Gemini or OpenAI-compatible key in Settings. Your text goes from your FolkBook server to the provider you pick, and nowhere else. Local models work too.',
  admin: 'As an admin you can add one for everyone on this server.',
  rest: 'Everything else in FolkBook works without it — AI only ever suggests, you always confirm.',
}

export const PROVIDERS = ['Google Gemini', 'OpenAI', 'OpenRouter', 'Ollama · LM Studio']

export const AIDS_PRIVATE = 'Memory aids stay private, even in shared spaces.'

export const FIELD_NAMES: Record<ChangeField, string> = {
  how_we_met: 'How you met',
  work: 'Work',
  birthday: 'Birthday',
  tags: 'Tags',
}

// Family links stored directly, without the parents that connect them.
const OTHER_FAMILY = ['sibling', 'cousin', 'grandparent', 'aunt_uncle']

/** The line under such a link: how it's saved, and that parents can come later. */
export const otherFamilyNote = (type: string) =>
  OTHER_FAMILY.includes(type)
    ? `Saved as other family · ${relationLabel(type)} — nobody's parents needed. Add their parents later and FolkBook works the same link out by itself.`
    : null

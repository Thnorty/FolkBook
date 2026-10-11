import type { AiProvider, AiSettings } from './queries'

export const PROVIDER_NAMES: Record<AiProvider['provider'], string> = {
  gemini: 'Gemini',
  openai_compatible: 'OpenAI-compatible',
}

/** "Gemini · gemini-2.5-flash". */
export const providerLine = (provider: AiProvider) =>
  `${PROVIDER_NAMES[provider.provider]} · ${provider.model}`

/**
 * Which AI Quick capture uses, for the line at the top of Settings → AI:
 * `who` is written bold ("your own key", "the server's AI"), `rest` follows it.
 */
export function aiUsage(settings: AiSettings): { who: string; rest: string } | null {
  if (settings.using === 'mine' && settings.mine) {
    return { who: 'your own key', rest: ` · ${providerLine(settings.mine)}` }
  }
  if (settings.using === 'server' && settings.server) {
    const by = settings.server.set_by ? `, set up by ${settings.server.set_by}` : ''
    return { who: "the server's AI", rest: `${by} · ${providerLine(settings.server)}` }
  }
  return null
}

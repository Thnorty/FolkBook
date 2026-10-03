// troika-three-text (the graph's text, via Reagraph) has no "types" in its package.json;
// this is the one call the graph makes to it directly.
declare module 'troika-three-text' {
  export function configureTextBuilder(config: { unicodeFontsURL?: string }): void
}

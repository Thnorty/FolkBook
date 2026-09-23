/** The FolkBook mark: a small ink square and the name in the serif. */
export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="size-5 rounded-tab bg-accent" />
      <span className="font-serif text-lg font-semibold">FolkBook</span>
    </div>
  )
}

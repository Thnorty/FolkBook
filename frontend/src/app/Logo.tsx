/** The FolkBook mark (the app icon) and the name in the serif. */
export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icons/icon.svg" alt="" className="size-6" />
      <span className="font-serif text-lg font-semibold">FolkBook</span>
    </div>
  )
}

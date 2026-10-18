import { cn } from '@/lib/utils'

type Mode = 'network' | 'tree'

/** "Network / Family tree" in the graph's header ("Network / Tree" on phones). */
export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const option = (value: Mode, label: string, short = label) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={mode === value}
      onClick={() => mode !== value && onChange(value)}
      className={cn(
        'h-9 cursor-pointer rounded-card px-3 text-md font-medium text-ink-soft md:h-8',
        mode === value && 'bg-card font-semibold text-ink shadow-paper',
      )}
    >
      <span className="md:hidden">{short}</span>
      <span className="hidden md:inline">{label}</span>
    </button>
  )
  return (
    <div className="flex rounded-card bg-chrome p-0.5">
      {option('network', 'Network')}
      {option('tree', 'Family tree', 'Tree')}
    </div>
  )
}

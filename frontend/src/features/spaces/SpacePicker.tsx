import { useQuery } from '@tanstack/react-query'
import { Choice } from '@/components/ui/choice'
import { labelClass } from '@/components/ui/label'
import { spacesQuery } from './queries'

type SpacePickerProps = {
  legend: string
  /** The choice for no limit, e.g. "All spaces". It's ticked while no space is. */
  allLabel: string
  /** The spaces picked; none means all, so a form never asks for none. */
  value: string[]
  onChange: (spaceIds: string[]) => void
}

/** Some of your spaces, or all of them: what an API key or a calendar link may reach. */
export function SpacePicker({ legend, allLabel, value, onChange }: SpacePickerProps) {
  const spaces = useQuery(spacesQuery).data?.items ?? []
  const toggle = (spaceId: string) =>
    onChange(value.includes(spaceId) ? value.filter((id) => id !== spaceId) : [...value, spaceId])

  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {spaces.map((space) => (
          <Choice
            key={space.id}
            name="spaces"
            type="checkbox"
            checked={value.includes(space.id)}
            onChange={() => toggle(space.id)}
          >
            {space.name}
          </Choice>
        ))}
        <Choice
          name="spaces"
          type="checkbox"
          checked={value.length === 0}
          onChange={() => onChange([])}
        >
          {allLabel}
        </Choice>
      </div>
    </fieldset>
  )
}

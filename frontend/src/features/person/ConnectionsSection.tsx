import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { linkLabel, relationLabel } from './labels'
import { ProfileSection } from './ProfileSection'
import { familyQuery, otherLinksQuery, type FamilyRelation, type Relationship } from './queries'

type Row = {
  key: string
  group: 'family' | 'other'
  personId: string
  name: string
  relation: string
  derived: boolean
  former: boolean
}

// More former connections than this and the group starts folded (screen 2n).
const OPEN_FORMER_UP_TO = 2

function familyRow(relation: FamilyRelation): Row {
  return {
    key: `family-${relation.person.id}-${relation.relation}`,
    group: 'family',
    personId: relation.person.id,
    name: relation.person.name,
    relation: relationLabel(relation.relation),
    derived: relation.derived,
    former: relation.former,
  }
}

function linkRow(link: Relationship, personId: string): Row {
  const other = link.person_a.id === personId ? link.person_b : link.person_a
  return {
    key: `link-${link.id}`,
    group: 'other',
    personId: other.id,
    name: other.name,
    relation: linkLabel(link),
    derived: false,
    former: link.is_former,
  }
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li key={row.key}>
          <Link
            to="/people/$personId"
            params={{ personId: row.personId }}
            className="flex items-baseline gap-3 rounded-tab px-2 py-2 hover:bg-hover"
          >
            <span className="font-serif text-lg">{row.name}</span>
            <span className="ml-auto text-md text-ink-soft">
              {row.former && 'former '}
              {row.relation}
            </span>
            {row.derived && (
              <span
                title="Worked out from other links, not entered directly"
                className="type-meta text-ink-faint"
              >
                derived
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Family (stored and worked out), other links, and a Former group (screens 1b, 2n). */
export function ConnectionsSection({ personId }: { personId: string }) {
  const family = useQuery(familyQuery(personId)).data ?? []
  const links = useQuery(otherLinksQuery(personId)).data ?? []
  const rows = [...family.map(familyRow), ...links.map((link) => linkRow(link, personId))]
  const current = (group: Row[]) => group.filter((row) => !row.former)
  const familyRows = current(rows.filter((row) => row.group === 'family'))
  const otherRows = current(rows.filter((row) => row.group === 'other'))
  const formerRows = rows.filter((row) => row.former)
  const [showFormer, setShowFormer] = useState<boolean | null>(null)
  const formerOpen = showFormer ?? formerRows.length <= OPEN_FORMER_UP_TO
  const currentCount = familyRows.length + otherRows.length

  return (
    <ProfileSection
      title="Connections"
      meta={
        rows.length > 0 &&
        [`${currentCount} current`, formerRows.length > 0 && `${formerRows.length} former`]
          .filter(Boolean)
          .join(' · ')
      }
    >
      {rows.length === 0 ? (
        <p className="type-small text-ink-soft">No connections yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {familyRows.length > 0 && (
            <div>
              <h3 className="px-2 pb-1 type-meta text-ink-faint">Family</h3>
              <Rows rows={familyRows} />
            </div>
          )}
          {otherRows.length > 0 && (
            <div>
              <h3 className="px-2 pb-1 type-meta text-ink-faint">Other</h3>
              <Rows rows={otherRows} />
            </div>
          )}
          {formerRows.length > 0 && (
            <div className="rounded-card border border-dashed border-line-strong p-2">
              <div className="flex items-center gap-2 px-2">
                <h3 className="type-meta text-ink-faint">Former · {formerRows.length}</h3>
                <Button
                  variant="ghost"
                  aria-expanded={formerOpen}
                  className="ml-auto h-9 md:h-8"
                  onClick={() => setShowFormer(!formerOpen)}
                >
                  {formerOpen ? 'Hide' : 'Show'}
                </Button>
              </div>
              {formerOpen && (
                <>
                  <Rows rows={formerRows} />
                  <p className="px-2 pt-1 type-small text-ink-faint">
                    Still in the graph, just not in the foreground.
                  </p>
                </>
              )}
            </div>
          )}
          <Link
            to="/graph"
            className="self-start px-2 text-md font-medium text-accent hover:underline"
          >
            See in graph →
          </Link>
        </div>
      )}
    </ProfileSection>
  )
}

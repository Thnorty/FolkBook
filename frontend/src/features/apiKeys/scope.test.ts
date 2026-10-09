import { describe, expect, it } from 'vitest'
import { accessLabel, scopeSummary, spacesLabel } from './scope'

const key = (extra = {}) => ({
  name: 'Obsidian sync',
  read_only: true,
  include_private: false,
  limited: false,
  spaces: [],
  ...extra,
})
const FRIENDS = { id: 's1', name: 'Friends' }
const FAMILY = { id: 's2', name: 'Family' }

describe('a key’s scope', () => {
  it('says what a key can do', () => {
    expect(accessLabel(key())).toBe('read-only')
    expect(accessLabel(key({ read_only: false }))).toBe('read-write')
  })

  it('names its spaces', () => {
    expect(spacesLabel(key())).toBe('All spaces')
    expect(spacesLabel(key({ limited: true, spaces: [FRIENDS, FAMILY] }))).toBe('Friends, Family')
    expect(spacesLabel(key({ limited: true, spaces: [] }))).toBe('No spaces left')
  })

  it('sums a key up in one line', () => {
    const obsidian = key({
      read_only: false,
      include_private: true,
      limited: true,
      spaces: [FRIENDS, FAMILY],
    })

    expect(scopeSummary(obsidian)).toBe(
      'Obsidian sync · read-write + private notes · Friends, Family',
    )
    expect(scopeSummary(key({ name: 'Home Assistant' }))).toBe(
      'Home Assistant · read-only · All spaces',
    )
  })
})

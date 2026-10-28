import { STAFF_SECTIONS, type SectionLink } from '../../shell/destinations'

const PROFILES_SECTION: SectionLink = {
  id: 'profiles',
  label: 'Profiles',
  to: '/admin/people/profiles',
  end: true,
}

/** Profiles sits on the People hub. Primary destinations stay as they are. */
export function peopleSections(): readonly SectionLink[] {
  const current = STAFF_SECTIONS.people ?? []
  if (current.some((item) => item.id === 'profiles')) return current
  const people = current.filter((item) => item.id === 'people')
  const rest = current.filter((item) => item.id !== 'people')
  return [...people, PROFILES_SECTION, ...rest]
}

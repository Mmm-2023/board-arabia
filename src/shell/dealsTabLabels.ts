import type { SectionLink } from './destinations'

/**
 * Visible Deals tab names on a phone.
 * Routes and the destination record keep the long names.
 */
const DEALS_TAB_LABEL: Record<string, string> = {
  mandates: 'Mandates',
  'real-estate': 'Property',
  'board-seats': 'Seats',
  'deal-rooms': 'Rooms',
}

export function dealsTabSections(sections: readonly SectionLink[]): SectionLink[] {
  return sections.map((section) => {
    const label = DEALS_TAB_LABEL[section.id]
    return label ? { ...section, label } : section
  })
}

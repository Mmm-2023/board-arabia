import type { ProfileListRow } from '../../src/lib/adminProfileList.ts'

export const EXAMPLE_ID = '11111111-1111-4111-8111-111111111111'
export const NOURA_ID = '22222222-2222-4222-8222-222222222222'
export const OMAR_ID = '33333333-3333-4333-8333-333333333333'
export const UNNAMED_ID = '44444444-4444-4444-8444-444444444444'

const later = {
  open_suggestion: null,
  open_request: null,
  help_with: null,
  looking_for: null,
  board_seat_type: null,
  board_seat_where: null,
} satisfies Pick<
  ProfileListRow,
  'open_suggestion' | 'open_request' | 'help_with' | 'looking_for' | 'board_seat_type' | 'board_seat_where'
>

export const PROFILE_FIXTURES: ProfileListRow[] = [
  {
    member_id: EXAMPLE_ID,
    display_name: 'Example Member',
    seat_label: 'Saudi Arabia',
    status: 'active',
    has_photo: true,
    title: 'Chair',
    organisation: 'Example House',
    city_key: 'riyadh',
    sector_count: 1,
    availability_set: true,
    theme_count: 1,
    profile_updated_at: '2026-10-20T09:00:00.000Z',
    ...later,
  },
  {
    member_id: NOURA_ID,
    display_name: 'Noura Example',
    seat_label: 'International',
    status: 'active',
    has_photo: true,
    title: 'Director',
    organisation: 'Example Capital',
    city_key: 'london',
    sector_count: 1,
    availability_set: false,
    theme_count: 0,
    profile_updated_at: '2026-10-18T09:00:00.000Z',
    ...later,
  },
  {
    member_id: OMAR_ID,
    display_name: 'Omar Example',
    seat_label: 'Saudi Arabia',
    status: 'suspended',
    has_photo: false,
    title: 'Chair',
    organisation: 'Example Works',
    city_key: null,
    sector_count: 1,
    availability_set: true,
    theme_count: 0,
    profile_updated_at: '2026-10-15T09:00:00.000Z',
    ...later,
  },
  {
    member_id: UNNAMED_ID,
    display_name: 'Name not set',
    seat_label: 'Partner',
    status: 'invited',
    has_photo: false,
    title: null,
    organisation: null,
    city_key: null,
    sector_count: 0,
    availability_set: false,
    theme_count: 0,
    profile_updated_at: null,
    ...later,
  },
]

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AI_TOOL_FLAG_DEFAULTS } from '../../supabase/functions/_shared/ai_tools'
import type { MemberRow, ProfileRow } from '../../src/lib/member'
import { SkipLink } from '../../src/components/SkipLink'
import { AiToolsHome } from '../../src/pages/dashboard/AiToolsHome'
import { AiToolsLayout } from '../../src/pages/dashboard/AiToolsLayout'
import { MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import { HelpPage } from '../../src/pages/dashboard/HelpPage'
import { MajlisLayout } from '../../src/pages/dashboard/MajlisLayout'
import { MajlisPage } from '../../src/pages/dashboard/MajlisPage'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const userId = 'a1000001-0000-4000-8000-000000000001'

const member: MemberRow = {
  user_id: userId,
  email: 'member@example.com',
  seat: 'intl',
  status: 'active',
  must_set_password: false,
  invites_remaining: 2,
  invites_granted: 2,
  founding_number: 1,
  tier: 'founding',
}

const profile: ProfileRow = {
  user_id: userId,
  full_name: 'Example Member',
  headline: 'Chair',
  company: 'Example House',
  location: 'Riyadh',
  linkedin_url: null,
  bio: null,
  phone: null,
  investable_capacity_usd: null,
  fo_aum_usd: null,
  turnover_usd: null,
  capacity_currency: null,
  include_in_public_aggregates: false,
  capacity_verified: false,
  avatar_path: null,
  avatar_style: 'male',
}

const room: MemberRoom = {
  userId,
  email: 'member@example.com',
  staffRole: null,
  member,
  profile,
  reload: async () => {},
}

function screenName() {
  const value = new URLSearchParams(window.location.search).get('screen') || 'help'
  if (value === 'majlis' || value === 'ai' || value === 'help') return value
  return 'help'
}

const screen = screenName()
const path = screen === 'majlis' ? '/dashboard/majlis' : screen === 'ai' ? '/dashboard/ai' : '/dashboard/help'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[path]}>
      <SkipLink />
      <MemberContext.Provider value={room}>
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={MEMBER_SECONDARY}
          updatedLabel={null}
          roleSwitch={null}
          onSignOut={() => {}}
          accountLabel="Example Member"
          accountName="Example Member"
        >
          <Routes>
            <Route path="/dashboard/ai" element={<AiToolsLayout />}>
              <Route
                index
                element={
                  <AiToolsHome
                    preview={{
                      flags: { ...AI_TOOL_FLAG_DEFAULTS, cfo_check: true, deal_readiness: true },
                      reports: [],
                    }}
                  />
                }
              />
            </Route>
            <Route path="/dashboard/majlis" element={<MajlisLayout />}>
              <Route index element={<MajlisPage preview={{ events: [] }} />} />
            </Route>
            <Route path="/dashboard/help" element={<HelpPage />} />
          </Routes>
        </AppShell>
      </MemberContext.Provider>
    </MemoryRouter>
  </StrictMode>,
)

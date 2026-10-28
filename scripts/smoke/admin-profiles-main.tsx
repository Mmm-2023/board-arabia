import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { AdminProfilesPage } from '../../src/pages/admin/AdminProfilesPage'
import { StaffMemberRecordPage } from '../../src/pages/admin/StaffMemberRecordPage'
import { peopleSections } from '../../src/pages/admin/peopleSections'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY, STAFF_SECTIONS } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import { EmptyState } from '../../src/shell/ViewState'
import { STAFF_VIEWS } from '../../src/shell/viewCopy'
import { PROFILE_FIXTURES } from './admin-profiles-fixtures'
import './smoke.css'

const view = new URLSearchParams(window.location.search).get('view') || 'list'

function seatCode(label: string) {
  if (label === 'Saudi Arabia') return 'ksa'
  if (label === 'International') return 'intl'
  if (label === 'Partner') return 'sponsor'
  return 'ksa'
}

function RecordRoute() {
  const { memberId = '' } = useParams()
  const row = PROFILE_FIXTURES.find((item) => item.member_id === memberId)
  return (
    <StaffMemberRecordPage
      preview={{
        full_name: row?.display_name || 'Member',
        seat: seatCode(row?.seat_label || ''),
        status: row?.status || 'active',
        directory_hidden: false,
      }}
    />
  )
}

function BeforeMembers() {
  return (
    <section>
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Members</h1>
      <div className="mt-4">
        <EmptyState
          tone="staff"
          message={STAFF_VIEWS.people.empty}
          action={{ label: 'Applications', to: '/admin/applications' }}
        />
      </div>
    </section>
  )
}

function Screen() {
  const before = view === 'before'
  const entry = before ? '/admin/people' : view === 'record' ? `/admin/people/member/${PROFILE_FIXTURES[0]?.member_id}` : '/admin/people/profiles'
  return (
    <MemoryRouter initialEntries={[entry]}>
      <div data-shot={view}>
        <AppShell
          tone="staff"
          destinations={STAFF_DESTINATIONS}
          secondary={STAFF_SECONDARY}
          updatedLabel="Updated 16:25 AST"
          roleSwitch={null}
          onSignOut={() => undefined}
          accountLabel="Admin"
          accountName="Admin"
        >
          <SectionTabs label="People sections" sections={before ? (STAFF_SECTIONS.people ?? []) : peopleSections()} />
          <div className="mt-6">
            {before ? (
              <BeforeMembers />
            ) : (
              <Routes>
                <Route
                  path="/admin/people/profiles"
                  element={
                    <AdminProfilesPage
                      preview={{
                        status: 'ready',
                        rows: view === 'empty' ? [] : PROFILE_FIXTURES,
                        introsOff: view === 'intros-off',
                      }}
                    />
                  }
                />
                <Route path="/admin/people/member/:memberId" element={<RecordRoute />} />
              </Routes>
            )}
          </div>
        </AppShell>
      </div>
    </MemoryRouter>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<Screen />)

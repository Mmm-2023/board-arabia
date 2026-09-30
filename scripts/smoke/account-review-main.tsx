import { type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Footer } from '../../src/components/Footer'
import { Nav } from '../../src/components/Nav'
import { accountDealFallback } from '../../src/lib/accountPreview'
import { AccountDealList, AccountHomeView, AccountMembership } from '../../src/pages/dashboard/account/views'
import { RegisterScreen } from '../../src/pages/apply/RegisterScreen'
import { VerifyScreen } from '../../src/pages/apply/VerifyScreen'
import { AppShell } from '../../src/shell/AppShell'
import { ACCOUNT_SHEET_LINKS, LOCKED_HUBS, MEMBER_DESTINATIONS, MEMBER_SECTIONS } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import '../../src/index.css'

const view = new URLSearchParams(window.location.search).get('view') || 'register'

function Shell({
  path,
  accountOpen = false,
  children,
}: {
  path: string
  accountOpen?: boolean
  children: ReactNode
}) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={ACCOUNT_SHEET_LINKS}
        lockedDestinationIds={LOCKED_HUBS}
        updatedLabel={null}
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="ada@example.com"
        accountName="Ada Example"
        initialAccountOpen={accountOpen}
      >
        {children}
      </AppShell>
    </MemoryRouter>
  )
}

function Screen() {
  if (view === 'register') {
    return (
      <MemoryRouter initialEntries={['/apply']}>
        <RegisterScreen
          invite={{ kind: 'none' }}
          submitting={false}
          error=""
          onSubmit={() => {}}
          onFocus={() => {}}
          security="preview"
          nav={<Nav />}
          footer={<Footer />}
        />
      </MemoryRouter>
    )
  }
  if (view === 'verify') {
    return (
      <MemoryRouter initialEntries={['/apply/verify']}>
        <VerifyScreen
          email="ada@example.com"
          submitting={false}
          resending={false}
          error=""
          note=""
          resendWait={0}
          onSubmit={() => {}}
          onResend={() => {}}
          security="preview"
          nav={<Nav />}
        />
      </MemoryRouter>
    )
  }
  if (view === 'home') {
    return (
      <Shell path="/dashboard">
        <AccountHomeView
          totals={null}
          totalsState="ready"
          onRetryTotals={() => {}}
          showWelcome={false}
          onDismissWelcome={() => {}}
        />
      </Shell>
    )
  }
  if (view === 'locked') {
    return (
      <Shell path="/dashboard/deals/mandates">
        <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
        <div className="mt-6">
          <AccountDealList deals={accountDealFallback()} />
        </div>
      </Shell>
    )
  }
  return (
    <Shell path="/dashboard" accountOpen>
      <AccountMembership />
    </Shell>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<Screen />)

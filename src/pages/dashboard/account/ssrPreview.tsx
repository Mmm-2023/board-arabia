import { createElement, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { presentAccountDeals, presentAccountTotals } from '../../../lib/accountPreview'
import { ACCOUNT_SHEET_LINKS, LOCKED_HUBS, MEMBER_DESTINATIONS } from '../../../shell/destinations'
import { AppShell } from '../../../shell/AppShell'
import {
  AccountAi,
  AccountDealList,
  AccountDirectory,
  AccountHomeView,
  AccountIntros,
  AccountInvites,
  AccountMajlis,
  AccountMembership,
  AccountRealEstate,
  AccountRooms,
} from './views'

function frame(node: ReactNode) {
  return createElement(MemoryRouter, null, node)
}

const POISON = {
  company_name: 'Nahla Industrial Holding',
  contact_email: 'amal.desk@example.com',
  venue_name: 'Riyadh private salon',
  starts_at: '30 Sep 2026',
  exact_amount: 'SAR 68.5 million',
}

export function lockedPages() {
  const deals = presentAccountDeals([
    {
      id: 'a2000001-0000-4000-8000-000000000001',
      is_demo: true,
      sector: 'Energy transition',
      ask: 'Growth capital for a Saudi industrial services platform.',
      status: 'Diligence',
      ...POISON,
    },
  ])
  const totals = presentAccountTotals({
    investment_usd: 0,
    founding_admitted_count: 0,
    founding_ksa_count: 0,
    founding_intl_count: 0,
    ...POISON,
  })
  return [
    frame(createElement(AccountDealList, { deals })),
    frame(createElement(AccountRealEstate)),
    frame(createElement(AccountRooms)),
    frame(createElement(AccountDirectory)),
    frame(createElement(AccountIntros)),
    frame(createElement(AccountInvites)),
    frame(createElement(AccountMajlis)),
    frame(createElement(AccountAi)),
    frame(createElement(AccountMembership)),
    frame(
      createElement(AccountHomeView, {
        totals,
        totalsState: 'ready',
        onRetryTotals: () => {},
        showWelcome: false,
        onDismissWelcome: () => {},
      }),
    ),
    frame(
      createElement(AccountHomeView, {
        totals: null,
        totalsState: 'ready',
        onRetryTotals: () => {},
        showWelcome: true,
        onDismissWelcome: () => {},
      }),
    ),
    <MemoryRouter key="sheet" initialEntries={['/dashboard/membership']}>
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
        initialAccountOpen
      >
        <AccountMembership />
      </AppShell>
    </MemoryRouter>,
  ]
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { STARTER_OUTLETS } from '../../supabase/functions/_shared/outlet_allowlist.ts'
import {
  DAILY_BRIEF_NOT_CONFIGURED,
  type MemberBrief,
  type OutletDraft,
} from '../../src/lib/dailyMarketBrief.ts'
import { DailyMarketBriefCard } from '../../src/pages/dashboard/DailyMarketBriefCard.tsx'
import { DailyMarketBriefView } from '../../src/pages/dashboard/DailyMarketBriefPage.tsx'
import { DailyMarketBriefPanelView } from '../../src/pages/admin/DailyMarketBriefPanel.tsx'
import './smoke.css'

const brief: MemberBrief = {
  briefDate: '2026-10-12',
  generatedAt: '2026-10-12T09:00:00.000Z',
  items: [
    {
      group: 'deals',
      summary: 'Example holding agrees a sample joint venture.',
      outlet: 'Saudi Press Agency',
      url: 'https://www.spa.gov.sa/w/example-deal',
      dated: '2026-10-12',
    },
    {
      group: 'regulation',
      summary: 'Example regulator publishes a sample consultation.',
      outlet: 'Capital Market Authority',
      url: 'https://cma.org.sa/en/example-rule',
      dated: '2026-10-12',
    },
    {
      group: 'leadership',
      summary: 'Example company names a sample chair.',
      outlet: 'Arab News',
      url: 'https://www.arabnews.com/example-board',
      dated: '2026-10-11',
    },
  ],
}

const outlets: OutletDraft[] = STARTER_OUTLETS.map((outlet, index) => ({
  id: `outlet-${index + 1}`,
  name: outlet.name,
  domain: outlet.domain,
  pathPrefix: outlet.pathPrefix ?? '',
  enabled: outlet.enabled,
  sortOrder: index + 1,
}))

const noop = () => undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <div className="bg-ink px-4 py-6 text-pearl">
        <DailyMarketBriefPanelView
          outlets={outlets}
          enabled={false}
          membersVisible={false}
          statusLine={DAILY_BRIEF_NOT_CONFIGURED}
          preview={brief}
          onEnabled={noop}
          onMembersVisible={noop}
          onSave={noop}
          onAdd={() => true}
          onMove={noop}
        />
      </div>
      <div id="member-card" className="bg-pearl px-4 py-6 text-ink">
        <DailyMarketBriefCard brief={brief} />
      </div>
      <div id="member-page" className="bg-pearl px-4 py-6 text-ink">
        <DailyMarketBriefView brief={brief} />
      </div>
      <div id="member-empty" className="bg-pearl px-4 py-6 text-ink">
        <DailyMarketBriefView brief={null} />
      </div>
    </MemoryRouter>
  </StrictMode>,
)

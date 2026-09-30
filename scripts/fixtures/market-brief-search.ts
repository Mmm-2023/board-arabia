import type { MarketSearchHit } from '../../supabase/functions/ai-tool-job/tools/market_brief.ts'

/**
 * Recorded example search responses for tests and shots.
 * example.com only. Not a live search and not a source to ship as fact.
 */
export const MARKET_SEARCH_FIXTURE: MarketSearchHit[] = [
  {
    topic: 'licences',
    title: 'Example note on investment registration',
    url: 'https://example.com/misa/investment-registration',
    dated: '15 Jan 2026',
    snippet:
      'A foreign company commonly files an investment registration before it operates. The authority lists sector activities on the public form.',
  },
  {
    topic: 'ownership',
    title: 'Example note on foreign ownership',
    url: 'https://example.com/misa/foreign-ownership',
    dated: '02 Feb 2026',
    snippet:
      'Some activities allow full foreign ownership and some still expect a local partner. The public list is the place to check the activity.',
  },
  {
    topic: 'saudization',
    title: 'Example note on Nitaqat',
    url: 'https://example.com/hrsd/nitaqat',
    dated: '20 Mar 2026',
    snippet:
      'Nitaqat groups firms by sector and size and sets a Saudization range. The public guide tells firms to confirm the current range.',
  },
  {
    topic: 'incentives',
    title: 'Example note on incentives',
    url: 'https://example.com/misa/incentives',
    dated: '04 Apr 2026',
    snippet:
      'Public incentive pages describe tax and customs relief for qualifying projects. Eligibility depends on the activity and the licence.',
  },
]

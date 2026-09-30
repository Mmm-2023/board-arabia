import { ExampleMark } from '../ExampleMark'
import { type LandingDeal } from '../../lib/landingPreview'
import { MEMBER_DESTINATIONS } from '../../shell/destinations'

const SELECTED = 'deals'

export function ProductFrame({ deals }: { deals: LandingDeal[] }) {
  return (
    <div className="ba-frame">
      <div className="ba-frame-bar" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="ba-frame-body">
        <ul className="ba-frame-side" aria-hidden="true">
          {MEMBER_DESTINATIONS.map((item) => (
            <li key={item.id} data-current={item.id === SELECTED ? 'true' : undefined}>
              {item.label}
            </li>
          ))}
        </ul>
        <div className="ba-frame-main">
          <p className="ba-frame-chip" data-chip="">Preview · no live data</p>
          {deals.length > 0 ? (
            <ul className="ba-frame-deals" aria-label="Opportunities">
              {deals.map((deal) => (
                <li key={deal.id}>
                  <article>
                    <div className="ba-frame-deal-top">
                      <h3>{deal.sector}</h3>
                      <span className="ba-frame-meta">
                        {deal.is_demo ? <ExampleMark /> : null}
                        <span>{deal.status}</span>
                      </span>
                    </div>
                    <p>{deal.ask}</p>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ba-quiet">No opportunities are listed in this preview.</p>
          )}
        </div>
      </div>
    </div>
  )
}

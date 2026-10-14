import { Link } from 'react-router-dom'
import { MarketingLayout } from '../components/MarketingLayout'
import { LegalDocumentView } from '../components/LegalDocumentView'
import { PRIVACY_EN } from '../content/legal/privacy.en'

export function PrivacyPage() {
  return (
    <MarketingLayout path="/privacy">
      <LegalDocumentView doc={PRIVACY_EN} pageId="privacy" />
      <p className="mx-auto w-full max-w-3xl px-5 pb-16 md:px-10">
        <Link to="/account-deletion/" className="border-b border-brass text-ink">
          How to delete your account
        </Link>
      </p>
    </MarketingLayout>
  )
}

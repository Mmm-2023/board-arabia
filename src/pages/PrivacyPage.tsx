import { MarketingLayout } from '../components/MarketingLayout'
import { LegalDocumentView } from '../components/LegalDocumentView'
import { PRIVACY_EN } from '../content/legal/privacy.en'

export function PrivacyPage() {
  return (
    <MarketingLayout path="/privacy">
      <LegalDocumentView doc={PRIVACY_EN} pageId="privacy" />
    </MarketingLayout>
  )
}

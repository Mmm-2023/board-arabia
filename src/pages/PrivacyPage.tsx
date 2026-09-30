import { MarketingLayout } from '../components/MarketingLayout'
import { LegalTermsOrPrivacy } from '../components/LegalDocumentView'
import { PRIVACY_AR } from '../content/legal/privacy.ar'
import { PRIVACY_EN } from '../content/legal/privacy.en'

export function PrivacyPage() {
  return (
    <MarketingLayout path="/privacy">
      <LegalTermsOrPrivacy en={PRIVACY_EN} ar={PRIVACY_AR} pageId="privacy" />
    </MarketingLayout>
  )
}

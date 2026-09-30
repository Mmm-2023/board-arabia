import { MarketingLayout } from '../components/MarketingLayout'
import { LegalTermsOrPrivacy } from '../components/LegalDocumentView'
import { TERMS_AR } from '../content/legal/terms.ar'
import { TERMS_EN } from '../content/legal/terms.en'

export function TermsPage() {
  return (
    <MarketingLayout path="/terms">
      <LegalTermsOrPrivacy en={TERMS_EN} ar={TERMS_AR} pageId="terms" />
    </MarketingLayout>
  )
}

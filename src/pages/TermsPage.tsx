import { MarketingLayout } from '../components/MarketingLayout'
import { LegalDocumentView } from '../components/LegalDocumentView'
import { TERMS_EN } from '../content/legal/terms.en'

export function TermsPage() {
  return (
    <MarketingLayout path="/terms">
      <LegalDocumentView doc={TERMS_EN} pageId="terms" />
    </MarketingLayout>
  )
}

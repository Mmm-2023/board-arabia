import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { presentReport, type BuiltReport } from '../../supabase/functions/_shared/due_diligence.ts'
import { DueDiligenceReport } from '../pages/dashboard/DueDiligenceReport.tsx'

export function renderDueReport(report: BuiltReport, fileName: string, preparedAt: string) {
  const presented = presentReport(report, fileName)
  return renderToStaticMarkup(
    <MemoryRouter>
      <DueDiligenceReport
        presented={presented}
        preparedAt={preparedAt}
        report={report}
        reportId="11111111-1111-4111-8111-111111111111"
      />
    </MemoryRouter>,
  )
}

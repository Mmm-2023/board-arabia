import { AiToolBanner, AiToolForm } from './AiToolDesk'
import type { RenderedToolCopy } from '../../lib/aiToolCopy'
import { dealFileHint, dealUploadNote, DEAL_ACCEPT } from '../../lib/aiToolCopy'

export function DealReadinessNotice({ text }: { text: string }) {
  return <AiToolBanner text={text} />
}

export function DealReadinessForm({
  copy,
  retentionDays,
  consented,
  fileName,
  busy,
  onConsent,
  onFile,
  onRun,
}: {
  copy: RenderedToolCopy
  retentionDays: number
  consented: boolean
  fileName: string
  busy: boolean
  onConsent: (value: boolean) => void
  onFile: (file: File | null) => void
  onRun: () => void
}) {
  return (
    <AiToolForm
      hideBanner
      copy={copy}
      consented={consented}
      fileName={fileName}
      busy={busy}
      accept={DEAL_ACCEPT}
      fileHint={dealFileHint(retentionDays)}
      extra={
        <>
          {fileName ? null : (
            <p className="mt-6 text-[1rem] leading-relaxed text-ink/70" data-re-readiness-empty="">
              No memo yet. Choose a teaser or information memorandum.
            </p>
          )}
          <p
            className="mt-4 text-[0.98rem] leading-relaxed text-ink/80"
            data-re-pdpl=""
            data-re-retention={retentionDays === 30 ? '30-day' : String(retentionDays)}
          >
            {dealUploadNote(retentionDays)}
          </p>
        </>
      }
      onConsent={onConsent}
      onFile={onFile}
      onRun={onRun}
    />
  )
}

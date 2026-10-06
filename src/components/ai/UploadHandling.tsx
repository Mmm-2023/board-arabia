import { AI_UPLOAD_HINT, UPLOAD_HANDLING, UPLOAD_HANDLING_SUMMARY } from '../../content/trust'

/** Trust line under an AI drop zone, plus the optional handling disclosure. */
export function AiUploadTrust({ fileHint }: { fileHint?: string }) {
  const covered = (fileHint || '').includes('Only your account can open this file')
  return (
    <>
      {covered ? null : (
        <p className="mt-2 text-[0.92rem] leading-relaxed text-ink/65" data-ai-upload-hint="">
          {AI_UPLOAD_HINT}
        </p>
      )}
      <UploadHandling />
    </>
  )
}

export function UploadHandling() {
  return (
    <details className="mt-3 border border-[var(--ba-line)] bg-white px-4 py-2" data-upload-handling="">
      <summary className="flex min-h-11 cursor-pointer items-center text-[0.95rem] font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ba-indigo)]">
        {UPLOAD_HANDLING_SUMMARY}
      </summary>
      <p className="pb-2 text-[0.95rem] leading-relaxed text-ink/75">{UPLOAD_HANDLING}</p>
    </details>
  )
}

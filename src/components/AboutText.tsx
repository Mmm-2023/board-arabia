/** Plain text. React escapes the value. Do not render it as HTML. */

export function AboutText({ value }: { value: string }) {
  const text = value.trim()
  if (!text) return null
  return (
    <div data-about="">
      <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">About</p>
      <p className="mt-1 text-[0.95rem] leading-relaxed break-words whitespace-pre-wrap text-ink/80">{text}</p>
    </div>
  )
}

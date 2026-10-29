export function ExampleMark({ large = false }: { large?: boolean }) {
  return (
    <span
      data-chip=""
      className={`${large ? 'text-[0.875rem]' : 'text-[12px]'} font-semibold tracking-[0.04em] text-[var(--ba-copper-deep)] uppercase`}
    >
      Example
    </span>
  )
}

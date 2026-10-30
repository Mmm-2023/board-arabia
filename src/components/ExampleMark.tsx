export function ExampleMark({ large = false }: { large?: boolean }) {
  return (
    <span
      data-chip=""
      className={`${large ? 'text-[17px]' : 'text-[15px]'} font-semibold tracking-[0.04em] text-[var(--ba-copper-deep)] uppercase`}
    >
      Example
    </span>
  )
}

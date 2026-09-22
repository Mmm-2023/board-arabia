import { useNoIndex } from '../../lib/usePageTitle'

const MODULES = {
  directory: {
    title: 'No names on this page',
    body: 'The private directory of founding members will open here. It is not a public list, and this shell does not load one.',
  },
  mandates: {
    title: 'Nothing released',
    body: 'Capital writes a mandate. Admin reads it before a member sees it. Your inbox is empty.',
  },
  intros: {
    title: 'No introductions waiting',
    body: 'An introduction is proposed with a reason. Admin releases it, or does not. There is nothing here to approve or decline.',
  },
  rooms: {
    title: 'No room is open',
    body: 'A deal room opens for a live mandate, and only by admin. None are open.',
  },
  events: {
    title: 'No majlis is scheduled',
    body: 'Quarterly dates are circulated to members. They are not listed on the public site, and none are posted in this shell yet.',
  },
} as const

export function ModulePage({ id }: { id: keyof typeof MODULES }) {
  const module = MODULES[id]
  useNoIndex(`${label(id)} | Board Arabia`)
  return (
    <div className="max-w-xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
        {label(id)}
      </p>
      <h1 className="mt-3 font-display text-[2.3rem] font-bold tracking-[-0.03em] text-balance">
        {module.title}
      </h1>
      <p className="mt-4 text-[1.05rem] leading-relaxed text-ink/65">{module.body}</p>
    </div>
  )
}

function label(id: keyof typeof MODULES) {
  if (id === 'intros') return 'Introductions'
  if (id === 'events') return 'Events'
  return id.charAt(0).toUpperCase() + id.slice(1)
}

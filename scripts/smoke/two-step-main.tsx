import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import {
  AdminShareBar,
  Frame,
  MemberMfaPrompt,
  TwoStepChallengeScreen,
  TwoStepEnrolScreen,
} from '../../src/components/mfa/TwoStepScreens'
import { PrivateWorkCountsView } from '../../src/components/mfa/PrivateWorkCountsView'
import '../../src/index.css'

const view = new URLSearchParams(window.location.search).get('view') || 'enrol'
const fakeQr =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="white"/><rect x="12" y="12" width="40" height="40" fill="black"/><rect x="108" y="12" width="40" height="40" fill="black"/><rect x="12" y="108" width="40" height="40" fill="black"/></svg>',
  )

function Enrol({ forced }: { forced: boolean }) {
  return (
    <Frame tone="dark">
      <TwoStepEnrolScreen
        tone="dark"
        forced={forced}
        qr={fakeQr}
        manualKey="PREVIEW ONLY"
        code=""
        error=""
        factors={[]}
        busy={false}
        onCode={() => undefined}
        onVerify={(event) => event.preventDefault()}
        onStart={() => undefined}
        onRemove={() => undefined}
      />
    </Frame>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('missing root')

if (view === 'enrol') createRoot(root).render(<Enrol forced={false} />)
if (view === 'staff') createRoot(root).render(<Enrol forced />)
if (view === 'challenge') {
  createRoot(root).render(
    <Frame tone="dark">
      <TwoStepChallengeScreen
        tone="dark"
        code=""
        error=""
        busy={false}
        onCode={() => undefined}
        onSubmit={(event) => event.preventDefault()}
        onSignOut={() => undefined}
      />
    </Frame>,
  )
}
if (view === 'prompt') {
  createRoot(root).render(
    <div className="min-h-dvh bg-pearl px-5 py-8 text-ink">
      <BrowserRouter>
        <MemberMfaPrompt onDismiss={() => undefined} />
      </BrowserRouter>
    </div>,
  )
}
if (view === 'dd') {
  createRoot(root).render(
    <div className="min-h-dvh bg-pearl px-5 py-8 text-ink">
      <article className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Due diligence</p>
        <h1 className="mt-2 font-display text-[2rem] font-semibold">Northwind Freight</h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-ink/75">
          A saved report for example.com. Share it with admin only if you choose to.
        </p>
        <AdminShareBar
          shared={false}
          deckShared={false}
          busy={false}
          showDeck
          onToggle={() => undefined}
          onToggleDeck={() => undefined}
        />
      </article>
    </div>,
  )
}
if (view === 'ai') {
  createRoot(root).render(
    <div className="min-h-dvh bg-pearl px-5 py-8 text-ink">
      <article className="max-w-3xl border border-[var(--ba-line)] bg-white px-4 py-5">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">AI</p>
        <h1 className="mt-2 font-display text-[1.8rem] font-semibold">Example result</h1>
        <p className="mt-3 text-[1rem] leading-relaxed">A short example for the share control. No member file is included.</p>
        <AdminShareBar shared onToggle={() => undefined} busy={false} />
      </article>
    </div>,
  )
}
if (view === 'admin') {
  createRoot(root).render(
    <div className="min-h-dvh bg-ink px-5 py-8 text-pearl">
      <h1 className="font-display text-[2rem] font-semibold">Staff home</h1>
      <PrivateWorkCountsView
        counts={{
          due_diligence_decks: 4,
          due_diligence_jobs: { ready: 3, failed: 1 },
          due_diligence_reports: 3,
          due_diligence_reports_shared: 1,
          ai_tool_jobs: { ready: 2 },
          ai_tool_outputs: 2,
          ai_tool_outputs_shared: 1,
          ai_tool_notes: 2,
        }}
      />
    </div>,
  )
}

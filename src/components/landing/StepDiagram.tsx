import { firstSentence, PROCESS_STEPS } from '../../content/marketing'
import { usePendingReveal } from '../Reveal'

export function StepDiagram() {
  const ref = usePendingReveal<HTMLOListElement>()
  return (
    <ol ref={ref} className="ba-steps">
      {PROCESS_STEPS.map((step, index) => (
        <li key={step.n}>
          <span className="ba-node" data-last={index === PROCESS_STEPS.length - 1 ? 'true' : undefined}>
            <i aria-hidden="true" />
            <b>{index + 1}</b>
          </span>
          <h3>{step.title}</h3>
          <p>{firstSentence(step.home)}</p>
        </li>
      ))}
    </ol>
  )
}

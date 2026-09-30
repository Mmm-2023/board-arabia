import { firstSentence } from '../../content/marketing'
import { publicProcessSteps } from '../../content/twoTierCopy'
import { usePendingReveal } from '../Reveal'

export function StepDiagram() {
  const ref = usePendingReveal<HTMLOListElement>()
  const steps = publicProcessSteps()
  return (
    <ol ref={ref} className="ba-steps">
      {steps.map((step, index) => (
        <li key={step.n}>
          <span className="ba-node" data-last={index === steps.length - 1 ? 'true' : undefined}>
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

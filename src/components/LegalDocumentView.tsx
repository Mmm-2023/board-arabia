import type { ReactNode } from 'react'
import { aiUploads30DayRetention } from '../config/legal'
import { resolveLegalDocument } from '../content/legal/resolve'
import type { LegalDocument } from '../content/legal/types'

function MixedText({ text }: { text: string }) {
  const latinRun =
    /(\([^)\n]*[A-Za-z][^)\n]*\)|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z][A-Za-z0-9.+_:/@'-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.+_:/@'-]*)*)/g
  const parts = text.split(latinRun)
  return parts.map((part, index) =>
    /[A-Za-z]/.test(part) ? (
      <bdi key={index} dir="ltr">
        {part}
      </bdi>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}

function LetterList({ text }: { text: string }) {
  const lines = text.split('\n')
  const lead = lines[0] ?? ''
  const rest = lines.slice(1).filter((line) => line.trim())
  return (
    <>
      <p>
        <MixedText text={lead} />
      </p>
      {rest.length > 0 ? (
        <ul className="ba-legal-letters">
          {rest.map((line, index) => {
            const match = line.match(/^(\([^)]+\))\s*(.*)$/)
            if (!match) {
              return (
                <li key={index}>
                  <MixedText text={line} />
                </li>
              )
            }
            return (
              <li key={index}>
                <span className="ba-legal-mark" dir="ltr">
                  {match[1]}
                </span>
                <span>
                  <MixedText text={match[2] ?? ''} />
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </>
  )
}

export function LegalDocumentView({
  doc,
  pageId,
}: {
  doc: LegalDocument
  pageId: 'terms' | 'privacy'
}) {
  const resolved = resolveLegalDocument(doc, 'en')
  const retention30 = aiUploads30DayRetention()
  let inPreamble = true
  const blocks: ReactNode[] = []
  resolved.blocks.forEach((block, index) => {
    if (block.kind === 'h2') inPreamble = false
    if (block.kind === 'h1') {
      blocks.push(
        <h1 key={index} id={block.id}>
          <MixedText text={block.text} />
        </h1>,
      )
      return
    }
    if (block.kind === 'h2') {
      blocks.push(
        <h2 key={index} id={block.id}>
          <MixedText text={block.text} />
        </h2>,
      )
      return
    }
    if (block.kind === 'clause') {
      blocks.push(
        <div key={index} id={block.id} className="ba-legal-clause">
          <span className="ba-legal-num">{block.number}</span>
          <div className="ba-legal-body">
            <LetterList text={block.text} />
          </div>
        </div>,
      )
      return
    }
    if (block.kind === 'table') {
      blocks.push(
        <div key={index} id={block.id || undefined} className="ba-legal-table">
          <table>
            <thead>
              <tr>
                {block.headers.map((header) => (
                  <th key={header} scope="col">
                    <MixedText text={header} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join('|')}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} data-label={block.headers[cellIndex] ?? ''}>
                      <MixedText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      return
    }
    blocks.push(
      <p key={index} className={inPreamble ? 'ba-legal-preamble' : 'ba-legal-body'}>
        <MixedText text={block.text} />
      </p>,
    )
  })

  return (
    <article
      id={pageId}
      className="ba-legal ba-privacy mx-auto w-full max-w-3xl py-12 pl-5 pr-16 md:py-20 md:pl-10"
      lang="en"
      dir="ltr"
      data-legal-doc="true"
      data-ai-retention={retention30 ? '30-day' : 'account'}
      aria-labelledby={pageId === 'terms' ? 'terms-title' : 'privacy-title'}
    >
      {blocks}
    </article>
  )
}

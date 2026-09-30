import { guardStubOutput } from './legal_guard.ts'
import type { StubInput, StubOutput } from './types.ts'

type Source = { title: string; url: string; dated: string }

type TermFields = {
  company: string
  round: string
  instrument: string
  pricePerShare: string
  asking: string
  liquidation: string
  participation: string
  antidilution: string
  pool: string
  board: string
  drag: string
  information: string
  redemption: string
  noshop: string
  protective: string
  vesting: string
  sources: Source[]
  unused: string[]
}

const KEYS: Record<string, keyof TermFields> = {
  company: 'company',
  round: 'round',
  instrument: 'instrument',
  'price per share': 'pricePerShare',
  'asking figure': 'asking',
  'liquidation preference': 'liquidation',
  participation: 'participation',
  'anti-dilution': 'antidilution',
  'option pool': 'pool',
  board: 'board',
  'drag-along': 'drag',
  'information rights': 'information',
  redemption: 'redemption',
  'no-shop': 'noshop',
  'protective provisions': 'protective',
  'founder vesting': 'vesting',
}

const LIMITS =
  'General and educational only. Market practice here means patterns often described in public sources, not a legal opinion and not a view on what to do next.'

export function termSheetReviewOutput(input: StubInput): StubOutput {
  const fields = parseTermSheet(input.sourceText || '')
  const labelled = Object.keys(KEYS).some((key) => {
    const field = KEYS[key]
    return field !== 'sources' && field !== 'unused' && String(fields[field] || '').length > 0
  })
  if (!labelled) {
    return guardStubOutput({
      tool_key: 'term_sheet_review',
      title: 'Term sheet reviewer',
      summary: `Term sheet reviewer read of ${input.fileName}. General and educational only. It is not legal or investment advice. No labelled terms were found in readable text.`,
      findings: [
        'Key terms are summarised only when the file is readable text with one term on each line.',
        'Terms that look unusual against general market practice are not flagged until those lines are present.',
      ],
      questions: ['Which terms should your lawyer walk through with you?'],
      sources: [],
      limits: LIMITS,
      generated_on: input.generatedOn,
      model_id: input.modelId,
      model_skip_reason: input.modelSkipReason,
    })
  }

  const findings: string[] = []
  const questions: string[] = []
  const unusual: string[] = []

  findings.push(introFinding(fields))

  if (fields.liquidation) {
    const multiple = fields.liquidation.match(/(\d+(?:\.\d+)?)\s*x/i)
    const times = multiple ? Number(multiple[1]) : null
    const participating = /participating/i.test(fields.liquidation) && !/non-participating/i.test(fields.liquidation)
    if ((times != null && times > 1) || participating) {
      unusual.push('liquidation preference')
      findings.push(
        `Liquidation preference is stated as ${clip(fields.liquidation)}. Public descriptions of early preferred rounds more often mention 1x and non-participating. This looks unusual against that general pattern.`,
      )
      questions.push('How does the liquidation preference work on a partial exit, and who gets paid first?')
    } else {
      findings.push(
        `Liquidation preference is stated as ${clip(fields.liquidation)}. 1x non-participating is a pattern often described in public notes. Ask your lawyer to confirm the wording.`,
      )
    }
  }

  if (fields.participation) {
    const participating = /participating/i.test(fields.participation) && !/non-participating|none/i.test(fields.participation)
    if (participating) {
      unusual.push('participation')
      findings.push(
        `Participation is stated as ${clip(fields.participation)}. Non-participating is the pattern more often described in public notes. This looks unusual against that general pattern.`,
      )
      questions.push('Does participation end at a stated multiple, or does it continue?')
    } else {
      findings.push(
        `Participation is stated as ${clip(fields.participation)}. Non-participating is a pattern often described in public notes.`,
      )
    }
  }

  if (fields.antidilution) {
    if (/full ratchet/i.test(fields.antidilution)) {
      unusual.push('anti-dilution')
      findings.push(
        `Anti-dilution is stated as ${clip(fields.antidilution)}. Public descriptions more often mention a broad-based weighted average. Full ratchet looks unusual against that general pattern.`,
      )
      questions.push('Which share issues, if any, are carved out of the anti-dilution formula?')
    } else {
      findings.push(
        `Anti-dilution is stated as ${clip(fields.antidilution)}. Ask your lawyer how the formula treats the option pool and any excluded issues.`,
      )
      questions.push('How is the anti-dilution formula defined, and which issues are excluded?')
    }
  }

  if (fields.board) {
    const investors = fields.board.match(/(\d+)\s+investor/i)
    const total = fields.board.match(/of\s+(\d+)/i)
    const investorCount = investors ? Number(investors[1]) : null
    const seats = total ? Number(total[1]) : null
    if (investorCount != null && seats != null && investorCount * 2 > seats) {
      unusual.push('board')
      findings.push(
        `Board is stated as ${clip(fields.board)}. A balanced or founder-leaning board is more often described at an early round. An investor majority looks unusual against that general pattern.`,
      )
      questions.push('Who appoints each seat, and what happens if a director steps down?')
    } else {
      findings.push(`Board is stated as ${clip(fields.board)}. Ask your lawyer who appoints each seat.`)
    }
  }

  if (fields.pool) {
    const percent = fields.pool.match(/(\d+)\s*percent/i)
    const size = percent ? Number(percent[1]) : null
    if (size != null && size >= 20) {
      unusual.push('option pool')
      findings.push(
        `Option pool is stated as ${clip(fields.pool)}. Public descriptions of early rounds more often mention a smaller pool. A pool of this size looks unusual against that general pattern.`,
      )
      questions.push('Who bears the option pool, and is it calculated before or after the round?')
    } else if (fields.pool) {
      findings.push(`Option pool is stated as ${clip(fields.pool)}. Ask your lawyer who bears it and when it is calculated.`)
    }
  }

  if (fields.noshop) {
    const days = fields.noshop.match(/(\d+)\s*days/i)
    const count = days ? Number(days[1]) : null
    if (count != null && count >= 60) {
      unusual.push('no-shop')
      findings.push(
        `No-shop is stated as ${clip(fields.noshop)}. Public descriptions more often mention a shorter window. This length looks unusual against that general pattern.`,
      )
      questions.push('When does the no-shop start and end, and what counts as a breach?')
    } else if (fields.noshop) {
      findings.push(`No-shop is stated as ${clip(fields.noshop)}. Ask your lawyer when the window starts and what it covers.`)
    }
  }

  if (fields.redemption && !/^(none|no|n\/a|not applicable)$/i.test(fields.redemption)) {
    unusual.push('redemption')
    findings.push(
      `Redemption is stated as ${clip(fields.redemption)}. A redemption right is less often described in early-round public notes. This looks unusual against that general pattern.`,
    )
    questions.push('Can the redemption right force a sale of assets, and on what notice?')
  }

  if (fields.drag) {
    findings.push(
      `Drag-along is stated as ${clip(fields.drag)}. Ask your lawyer what majority is required and whether ordinary holders have a say.`,
    )
    if (/preferred/i.test(fields.drag) && /50/.test(fields.drag)) {
      unusual.push('drag-along')
      findings.push(
        'A drag that preferred holders can call at 50 percent, with no ordinary-holder vote mentioned, looks unusual against patterns that describe a higher bar.',
      )
    }
  }

  if (fields.protective && /ordinary[- ]course/i.test(fields.protective)) {
    unusual.push('protective provisions')
    findings.push(
      `Protective provisions are stated as ${clip(fields.protective)}. Covering ordinary-course matters looks broader than the veto list often described in public notes.`,
    )
    questions.push('Which ordinary-course actions need investor approval?')
  }

  if (fields.information) {
    findings.push(`Information rights are stated as ${clip(fields.information)}. Ask your lawyer how often reports are due and who may see them.`)
  }

  if (fields.vesting) {
    findings.push(
      `Founder vesting is stated as ${clip(fields.vesting)}. Four years with a one year cliff is a pattern often described in public notes. Ask your lawyer how acceleration works.`,
    )
  }

  if (fields.unused.length > 0) {
    findings.push(`Lines not used: ${fields.unused.slice(0, 3).join(' | ')}`)
  }

  questions.push('What else should your lawyer read in this document before you rely on it?')

  const name = fields.company || input.fileName
  const unusualText = unusual.length > 0 ? ` Lines that look unusual: ${unusual.join(', ')}.` : ' No line was marked as looking unusual.'
  return guardStubOutput({
    tool_key: 'term_sheet_review',
    title: 'Term sheet reviewer',
    summary: `Term sheet reviewer read of ${name}. General and educational only. It is not legal or investment advice.${unusualText}`,
    findings,
    questions: unique(questions),
    sources: fields.sources,
    limits: LIMITS,
    generated_on: input.generatedOn,
    model_id: input.modelId,
    model_skip_reason: input.modelSkipReason,
  })
}

function introFinding(fields: TermFields): string {
  const bits = [fields.company, fields.round, fields.instrument, fields.pricePerShare ? `price per share ${fields.pricePerShare}` : '']
    .map((item) => item.trim())
    .filter(Boolean)
  if (bits.length === 0) return 'The file names one or more terms. Each line below is a description, not a recommendation.'
  return `${bits.join('. ')}. The notes below describe those lines in plain words. They are not a recommendation.`
}

function parseTermSheet(text: string): TermFields {
  const fields: TermFields = {
    company: '',
    round: '',
    instrument: '',
    pricePerShare: '',
    asking: '',
    liquidation: '',
    participation: '',
    antidilution: '',
    pool: '',
    board: '',
    drag: '',
    information: '',
    redemption: '',
    noshop: '',
    protective: '',
    vesting: '',
    sources: [],
    unused: [],
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.length > 500) continue
    const match = line.match(/^([^:]{2,40}):\s*(.+)$/)
    if (!match) {
      fields.unused.push(clip(line))
      continue
    }
    const key = match[1].trim().toLowerCase()
    const value = match[2].trim()
    if (key === 'source') {
      const source = parseSource(value)
      if (source) fields.sources.push(source)
      else fields.unused.push(clip(line))
      continue
    }
    if (key === 'contact') continue
    const mapped = KEYS[key]
    if (!mapped || mapped === 'sources' || mapped === 'unused') {
      fields.unused.push(clip(line))
      continue
    }
    fields[mapped] = value
  }
  return fields
}

function parseSource(value: string): Source | null {
  const parts = value.split('|').map((part) => part.trim())
  if (parts.length < 3) return null
  const [title, url, dated] = parts
  if (!title || !dated || !/^https:\/\/[^\s]+$/i.test(url)) return null
  return { title: clip(title), url, dated: clip(dated) }
}

function clip(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 220)
}

function unique(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

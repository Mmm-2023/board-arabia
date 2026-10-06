import { publishedLegalIdentity } from '../../config/legalPageIdentity.ts'
import {
  aiUploads30DayRetention,
  EFFECTIVE_DATE,
  LEGAL_PENDING,
  legalField,
  type LegalField,
  type LegalLang,
} from '../../config/legal.ts'
import type { LegalBlock, LegalDocument } from './types.ts'

const AI_TERMS_30_DAY = 'Uploads are kept for 30 days and then deleted automatically. You can delete them earlier at any time.'

const AI_TERMS_WHILE_ACTIVE = 'Uploads are kept while your account is active. You can delete them at any time.'

const AI_ROW_30_DAY = 'Deleted after 30 days. You can delete them earlier at any time'

const AI_ROW_WHILE_ACTIVE = 'Kept while your account is active; you can delete them at any time'

const FEE_SENTENCE = 'Fees, if any, are as shown at the time of purchase.'

const TOKEN_FIELD: Record<string, LegalField | 'date'> = {
  '[EFFECTIVE DATE]': 'date',
  '[CONTACT EMAIL]': 'contactEmail',
  '[DPO CONTACT]': 'dpoContact',
  '[PARTNERS EMAIL]': 'partnersEmail',
  '[SERVICE EMAIL]': 'serviceEmail',
  '[AI PROVIDER]': 'aiProvider',
  '[BA ENTITY]': 'baEntity',
  '[ADDRESS]': 'address',
  '[CR]': 'cr',
}

const FEE_BRACKET = /fee|fees|credit/i

function legalDocumentValue(field: LegalField): string {
  const value = legalField(field, 'en')
  if ((field === 'baEntity' || field === 'cr') && value === LEGAL_PENDING.en) {
    return publishedLegalIdentity()[field]
  }
  return value
}

/** "of [ADDRESS]" reads as a broken sentence while the address is still the fallback. */
function addressClause(): string {
  const address = legalDocumentValue('address')
  if (address === LEGAL_PENDING.en) return `registered address: ${address}`
  return `of ${address}`
}

function fillText(text: string, retention30: boolean): string {
  let next = text
  if (!retention30) {
    next = next.split(AI_TERMS_30_DAY).join(AI_TERMS_WHILE_ACTIVE)
    next = next.split(AI_ROW_30_DAY).join(AI_ROW_WHILE_ACTIVE)
  }
  next = next.split('of [ADDRESS]').join(addressClause())
  for (const [token, field] of Object.entries(TOKEN_FIELD)) {
    const value = field === 'date' ? EFFECTIVE_DATE.en : legalDocumentValue(field)
    next = next.split(token).join(value)
  }
  next = next.replace(/\[[^[\]]+\]/g, (token) => (FEE_BRACKET.test(token) ? FEE_SENTENCE : token))
  return next
}

function fillBlock(block: LegalBlock, retention30: boolean): LegalBlock {
  if (block.kind === 'table') {
    return {
      ...block,
      headers: block.headers.map((cell) => fillText(cell, retention30)),
      rows: block.rows.map((row) => row.map((cell) => fillText(cell, retention30))),
    }
  }
  if (block.kind === 'clause') {
    return { ...block, text: fillText(block.text, retention30) }
  }
  return { ...block, text: fillText(block.text, retention30) }
}

/** Fills config placeholders and the AI upload retention wording. English only. */
export function resolveLegalDocument(
  doc: LegalDocument,
  _lang: LegalLang = 'en',
  retention30 = aiUploads30DayRetention(),
): LegalDocument {
  return {
    blocks: doc.blocks.map((block) => fillBlock(block, retention30)),
  }
}

export function legalPlainText(doc: LegalDocument): string {
  const parts: string[] = []
  for (const block of doc.blocks) {
    if (block.kind === 'table') {
      parts.push(block.headers.join(' '))
      for (const row of block.rows) parts.push(row.join(' '))
    } else if (block.kind === 'clause') {
      parts.push(`${block.number} ${block.text}`)
    } else {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

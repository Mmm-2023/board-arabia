import {
  aiUploads30DayRetention,
  EFFECTIVE_DATE,
  legalField,
  type LegalField,
  type LegalLang,
} from '../../config/legal.ts'
import type { LegalBlock, LegalDocument } from './types.ts'

const AI_TERMS_30_DAY: Record<LegalLang, string> = {
  en: 'Uploads are kept for 30 days and then deleted automatically. You can delete them earlier at any time.',
  ar: 'وتُحفظ الملفات المرفوعة لمدة 30 يوماً ثم تُحذف تلقائياً. ويمكنك حذفها قبل ذلك في أي وقت.',
}

const AI_TERMS_WHILE_ACTIVE: Record<LegalLang, string> = {
  en: 'Uploads are kept while your account is active. You can delete them at any time.',
  ar: 'تُحفظ الملفات المرفوعة طوال نشاط حسابك. ويمكنك حذفها في أي وقت.',
}

const AI_ROW_30_DAY: Record<LegalLang, string> = {
  en: 'Deleted after 30 days. You can delete them earlier at any time',
  ar: 'تُحذف بعد 30 يوماً، ويمكنك حذفها قبل ذلك في أي وقت',
}

const AI_ROW_WHILE_ACTIVE: Record<LegalLang, string> = {
  en: 'Kept while your account is active; you can delete them at any time',
  ar: 'تُحفظ طوال نشاط حسابك، ويمكنك حذفها في أي وقت.',
}

const FEE_SENTENCE: Record<LegalLang, string> = {
  en: 'Fees, if any, are as shown at the time of purchase.',
  ar: 'الرسوم، إن وجدت، هي كما تظهر وقت الشراء.',
}

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

const FEE_BRACKET = /fee|fees|credit|رسوم|رصيد/i

function fillText(text: string, lang: LegalLang, retention30: boolean): string {
  let next = text
  if (!retention30) {
    next = next.split(AI_TERMS_30_DAY[lang]).join(AI_TERMS_WHILE_ACTIVE[lang])
    next = next.split(AI_ROW_30_DAY[lang]).join(AI_ROW_WHILE_ACTIVE[lang])
  }
  for (const [token, field] of Object.entries(TOKEN_FIELD)) {
    const value = field === 'date' ? EFFECTIVE_DATE[lang] : legalField(field, lang)
    next = next.split(token).join(value)
  }
  next = next.replace(/\[[^[\]]+\]/g, (token) => (FEE_BRACKET.test(token) ? FEE_SENTENCE[lang] : token))
  return next
}

function fillBlock(block: LegalBlock, lang: LegalLang, retention30: boolean): LegalBlock {
  if (block.kind === 'table') {
    return {
      ...block,
      headers: block.headers.map((cell) => fillText(cell, lang, retention30)),
      rows: block.rows.map((row) => row.map((cell) => fillText(cell, lang, retention30))),
    }
  }
  if (block.kind === 'clause') {
    return { ...block, text: fillText(block.text, lang, retention30) }
  }
  return { ...block, text: fillText(block.text, lang, retention30) }
}

/** Fills config placeholders and the AI upload retention wording for one language. */
export function resolveLegalDocument(
  doc: LegalDocument,
  lang: LegalLang,
  retention30 = aiUploads30DayRetention(),
): LegalDocument {
  return {
    blocks: doc.blocks.map((block) => fillBlock(block, lang, retention30)),
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

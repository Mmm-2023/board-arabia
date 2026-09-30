export type LegalParagraph = {
  kind: 'p'
  text: string
}

export type LegalHeading = {
  kind: 'h1' | 'h2'
  id: string
  text: string
}

export type LegalClause = {
  kind: 'clause'
  id: string
  number: string
  text: string
}

export type LegalTable = {
  kind: 'table'
  id: string
  headers: string[]
  rows: string[][]
}

export type LegalBlock = LegalParagraph | LegalHeading | LegalClause | LegalTable

export type LegalDocument = {
  blocks: LegalBlock[]
}

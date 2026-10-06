import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { renderToolCopy } from '../src/lib/aiToolCopy.ts'
import {
  AI_REPORT_OPERATOR_CR,
  aiReportOperatorCredit,
  aiReportOperatorFields,
  aiReportOperatorName,
} from '../src/lib/aiReportOperator.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

/** Public Terms and Privacy stay on env placeholders. This task must not edit them. */
const PUBLIC_LEGAL = new Set([
  'src/content/legal/terms.en.ts',
  'src/content/legal/privacy.en.ts',
  'src/pages/TermsPage.tsx',
  'src/pages/PrivacyPage.tsx',
])

/**
 * Fictional sample companies. Not the AI report operator, and not "CR 0000000000".
 * The CFO workbook name is pinned by fixtures/cfo.
 */
const FICTIONAL_COMPANY = new Set([
  'src/pages/dashboard/account/views.tsx',
  'src/shell/tt2Preview.tsx',
  'src/shell/tr3Preview.tsx',
  'src/shell/tt3Preview.tsx',
  'supabase/functions/ai-tool-job/tools/cfo_example.ts',
])

const PUBLIC_ROUTES = [
  'src/App.tsx',
  'src/pages/LandingPage.tsx',
  'src/pages/ApplyPage.tsx',
  'src/pages/ForMembersPage.tsx',
  'src/pages/ForCapitalPage.tsx',
  'src/pages/PartnersPage.tsx',
  'src/pages/HowItWorksPage.tsx',
  'src/pages/AboutPage.tsx',
  'src/components/Footer.tsx',
  'src/components/WhoRunsTheDesk.tsx',
  'src/pages/TermsPage.tsx',
  'src/pages/PrivacyPage.tsx',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      walk(full, out)
      continue
    }
    if (/\.(ts|tsx|js|mjs|css|sql|html|md|json)$/.test(entry.name)) out.push(full)
  }
  return out
}

function rel(file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

test('the logged-in AI report footer names the operator', () => {
  assert.equal(aiReportOperatorName(), 'NAMMCO Holding Co.')
  assert.equal(AI_REPORT_OPERATOR_CR, '7043252647')
  assert.equal(aiReportOperatorCredit(), 'Provided by NAMMCO Holding Co., CR 7043252647')
  const copy = renderToolCopy('deal_readiness', 'en', {
    ...aiReportOperatorFields(),
    provider: 'Example AI',
    privacy: '/privacy',
    terms: '/terms',
    retentionDays: 30,
    date: '06 Oct 2026',
  })
  assert.match(copy.footer, /Provided by NAMMCO Holding Co\., CR 7043252647/)
  assert.equal(copy.footer.includes('Example Holdings'), false)
  assert.equal(copy.footer.includes('CR 0000000000'), false)
  const cfo = renderToolCopy('cfo_check', 'en', {
    ...aiReportOperatorFields(),
    provider: 'Example AI',
    privacy: '/privacy',
    terms: '/terms',
    retentionDays: 30,
    date: '06 Oct 2026',
  })
  assert.match(cfo.footer, /NAMMCO Holding Co\./)
  assert.match(cfo.footer, /CR 7043252647/)
})

test('the operator name and CR are one constant, and the placeholder is gone outside public Terms and Privacy', () => {
  const trees = [path.join(root, 'src'), path.join(root, 'supabase/functions')]
  const files = trees.flatMap((dir) => walk(dir))
  const nameLiteral: string[] = []
  const crLiteral: string[] = []
  const codeSites: string[] = []
  const exampleHoldings: string[] = []
  const placeholderCr: string[] = []
  const publicPlaceholder: string[] = []

  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const name = rel(file)
    if (text.includes('NAMMCO Holding Co.')) nameLiteral.push(name)
    if (text.includes('7043252647')) crLiteral.push(name)
    if (text.includes('OPERATOR_NAME_CODES')) codeSites.push(name)
    if (text.includes('CR 0000000000')) {
      if (PUBLIC_LEGAL.has(name)) publicPlaceholder.push(`${name}: CR 0000000000`)
      else placeholderCr.push(name)
    }
    if (text.includes('Example Holdings')) {
      if (PUBLIC_LEGAL.has(name)) publicPlaceholder.push(`${name}: Example Holdings`)
      else exampleHoldings.push(name)
    }
  }

  assert.deepEqual(nameLiteral, [])
  assert.deepEqual(crLiteral, ['src/lib/aiReportOperator.ts'])
  assert.deepEqual(codeSites, ['src/lib/aiReportOperator.ts'])
  assert.deepEqual(placeholderCr, [])
  assert.deepEqual(publicPlaceholder, [])
  assert.deepEqual(exampleHoldings.sort(), [...FICTIONAL_COMPANY].sort())

  for (const name of exampleHoldings) {
    const text = readFileSync(path.join(root, name), 'utf8')
    assert.equal(text.includes('CR 0000000000'), false, name)
    assert.equal(text.includes('Provided by'), false, name)
  }

  const operator = readFileSync(path.join(root, 'src/lib/aiReportOperator.ts'), 'utf8')
  assert.equal(/nammco/i.test(operator), false)
  assert.equal(operator.includes('\u2014'), false)
  assert.equal(operator.includes('\u2013'), false)

  for (const file of [
    'src/lib/aiToolConfig.ts',
    'src/components/ai/AiReportOperatorLine.tsx',
    'src/pages/dashboard/DueDiligenceMemo.tsx',
    'src/pages/dashboard/DueDiligenceReport.tsx',
    'src/pages/dashboard/DueDiligencePage.tsx',
  ]) {
    const text = readFileSync(path.join(root, file), 'utf8')
    assert.equal(/nammco/i.test(text), false, file)
    assert.equal(text.includes('Example Holdings'), false, file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
  }

  for (const file of ['src/pages/dashboard/DueDiligenceMemo.tsx', 'src/pages/dashboard/DueDiligenceReport.tsx', 'src/pages/dashboard/DueDiligencePage.tsx']) {
    assert.match(readFileSync(path.join(root, file), 'utf8'), /AiReportOperatorLine/, file)
  }
  assert.match(readFileSync(path.join(root, 'src/components/ai/AiReportOperatorLine.tsx'), 'utf8'), /data-ai-operator/)
  assert.match(readFileSync(path.join(root, 'src/lib/aiToolConfig.ts'), 'utf8'), /aiReportOperatorName\(/)
  assert.match(readFileSync(path.join(root, 'src/lib/aiToolCopy.ts'), 'utf8'), /Provided by \[BA ENTITY\], CR \[CR\]/)

  for (const file of PUBLIC_ROUTES) {
    const text = readFileSync(path.join(root, file), 'utf8')
    assert.equal(text.includes('aiReportOperator'), false, file)
    assert.equal(text.includes('NAMMCO Holding Co.'), false, file)
    assert.equal(text.includes('7043252647'), false, file)
  }

  const who = readFileSync(path.join(root, 'src/components/WhoRunsTheDesk.tsx'), 'utf8')
  assert.match(who, /Michael Mateer, Co-Founder and CEO/)
  const footer = readFileSync(path.join(root, 'src/components/Footer.tsx'), 'utf8')
  assert.match(footer, /powered by nammco/)
  const apply = readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  assert.match(apply, /path="\/apply"/)
})

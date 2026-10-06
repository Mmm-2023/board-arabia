import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { footerWithOperator, operatorCredit } from '../src/lib/aiReportOperator.ts'
import { allowsLegalEntityLine } from './public-nammco.mjs'
import { renderToolCopy } from '../src/lib/aiToolCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const OPERATOR_NAME = 'NAMMCO Holding Co.'
const OPERATOR_CR = '7043252647'

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
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      walk(full, out)
      continue
    }
    out.push(full)
  }
  return out
}

function rel(file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

function textFiles(dir: string): string[] {
  return walk(dir).filter((file) => /\.(ts|tsx|js|mjs|css|sql|html|md|json)$/.test(file))
}

test('the logged-in footer adds the fetched operator and drops the sentence when it is missing', () => {
  assert.equal(operatorCredit(null), null)
  assert.equal(operatorCredit({ entity: ' ', cr: OPERATOR_CR }), null)
  assert.equal(operatorCredit({ entity: OPERATOR_NAME, cr: ' ' }), null)
  assert.equal(operatorCredit({ entity: OPERATOR_NAME, cr: OPERATOR_CR }), `Provided by ${OPERATOR_NAME}, CR ${OPERATOR_CR}`)

  const copy = renderToolCopy('deal_readiness', 'en', {
    entity: 'To be confirmed',
    cr: 'To be confirmed',
    provider: 'Example AI',
    privacy: '/privacy',
    terms: '/terms',
    retentionDays: 30,
    date: '06 Oct 2026',
  })
  assert.equal(copy.footer.includes('Provided by'), false)
  assert.equal(copy.footer.includes('To be confirmed'), false)
  assert.equal(copy.footer.includes('Example Holdings'), false)
  assert.equal(copy.footer.includes('CR 0000000000'), false)
  assert.match(copy.footer, /under the Board Arabia Terms/)

  const named = footerWithOperator(copy.footer, { entity: OPERATOR_NAME, cr: OPERATOR_CR })
  assert.match(named, /Provided by NAMMCO Holding Co\., CR 7043252647, under the Board Arabia Terms/)
  assert.equal(footerWithOperator(copy.footer, null), copy.footer)
  assert.equal(footerWithOperator(named, { entity: OPERATOR_NAME, cr: OPERATOR_CR }), named)

  const cfo = renderToolCopy('cfo_check', 'en', {
    entity: '',
    cr: '',
    provider: 'Example AI',
    privacy: '/privacy',
    terms: '/terms',
    retentionDays: 30,
    date: '06 Oct 2026',
  })
  assert.equal(cfo.footer.includes('Provided by'), false)
  assert.match(footerWithOperator(cfo.footer, { entity: OPERATOR_NAME, cr: OPERATOR_CR }), /CR 7043252647/)
})

test('the operator placeholder is gone from src and edge, and the seed is only in the migration', () => {
  const trees = [path.join(root, 'src'), path.join(root, 'supabase/functions')]
  const files = trees.flatMap((dir) => textFiles(dir))
  const nameLiteral: string[] = []
  const crLiteral: string[] = []
  const codeSites: string[] = []
  const exampleHoldings: string[] = []
  const placeholderCr: string[] = []
  const publicPlaceholder: string[] = []

  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const name = rel(file)
    if (/nammco holding co/i.test(text) || text.includes(OPERATOR_CR)) {
      if (/nammco holding co/i.test(text)) nameLiteral.push(name)
      if (text.includes(OPERATOR_CR)) crLiteral.push(name)
    }
    if (text.includes('OPERATOR_NAME_CODES') || text.includes('78, 65, 77, 77, 67, 79') || text.includes('fromCharCode(78')) {
      codeSites.push(name)
    }
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
  assert.deepEqual(crLiteral, [])
  assert.deepEqual(codeSites, [])
  assert.deepEqual(placeholderCr, [])
  assert.deepEqual(publicPlaceholder, [])
  assert.deepEqual(exampleHoldings.sort(), [...FICTIONAL_COMPANY].sort())

  const migration = readFileSync(path.join(root, 'supabase/migrations/20261126120000_ai_report_operator.sql'), 'utf8')
  assert.match(migration, /insert into public\.ai_report_operator/)
  assert.match(migration, /'NAMMCO Holding Co\.'/)
  assert.match(migration, /'7043252647'/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /force row level security/)
  assert.match(migration, /revoke all on table public\.ai_report_operator from public, anon, authenticated/)
  assert.match(migration, /grant select on table public\.ai_report_operator to authenticated/)
  assert.match(migration, /for select to authenticated/)
  assert.match(migration, /using \(true\)/)
  assert.equal(/grant\s+select[^;]*\sto\s+anon\b/i.test(migration), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)

  const hook = readFileSync(path.join(root, 'src/lib/useAiReportOperator.ts'), 'utf8')
  assert.match(hook, /from\('ai_report_operator'\)/)
  assert.match(hook, /loadAiReportOperator/)
  assert.equal(/nammco/i.test(hook), false)
  assert.equal(hook.includes(OPERATOR_CR), false)
  const line = readFileSync(path.join(root, 'src/components/ai/AiReportOperatorLine.tsx'), 'utf8')
  assert.match(line, /useAiReportOperator/)
  assert.match(line, /if \(!credit\) return null/)
  const desk = readFileSync(path.join(root, 'src/components/ai/AiToolDesk.tsx'), 'utf8')
  assert.match(desk, /footerWithOperator\(rest, useAiReportOperator\(\)\)/)

  for (const file of PUBLIC_ROUTES) {
    const text = readFileSync(path.join(root, file), 'utf8')
    assert.equal(text.includes('useAiReportOperator'), false, file)
    assert.equal(text.includes('ai_report_operator'), false, file)
    assert.equal(/nammco holding/i.test(text), false, file)
    assert.equal(text.includes(OPERATOR_CR), false, file)
  }

  const who = readFileSync(path.join(root, 'src/components/WhoRunsTheDesk.tsx'), 'utf8')
  assert.match(who, /Michael Mateer, Co-Founder and CEO/)
  const footer = readFileSync(path.join(root, 'src/components/Footer.tsx'), 'utf8')
  assert.match(footer, /powered by nammco/)
  const apply = readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  assert.match(apply, /path="\/apply"/)
})

test('the built site keeps the operator name and CR on the legal pages only', () => {
  const dist = path.join(root, 'dist')
  if (!existsSync(dist)) {
    execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' })
  }
  assert.equal(existsSync(dist), true)
  const name = /nammco holding co\.?/i
  const codes = ['78,65,77,77,67,79', '78, 65, 77, 77, 67, 79']
  const encoded = [
    Buffer.from(OPERATOR_NAME).toString('base64'),
    Buffer.from(OPERATOR_NAME.toLowerCase()).toString('base64'),
    Buffer.from(OPERATOR_CR).toString('base64'),
    Buffer.from('NAMMCO').toString('base64'),
  ]
  const hits: string[] = []
  for (const file of walk(dist)) {
    const text = readFileSync(file).toString('latin1')
    const reasons: string[] = []
    if (name.test(text)) reasons.push('name')
    if (text.includes(OPERATOR_CR)) reasons.push('cr')
    if (codes.some((code) => text.includes(code))) reasons.push('char-codes')
    if (encoded.some((value) => text.includes(value))) reasons.push('base64')
    if (!reasons.length) continue
    const relative = rel(file)
    const identityOnly = reasons.every((reason) => reason === 'name' || reason === 'cr')
    if (identityOnly && allowsLegalEntityLine(relative)) continue
    hits.push(`${relative}: ${reasons.join(', ')}`)
  }
  assert.deepEqual(hits, [])
})

function psqlReady(): boolean {
  try {
    execFileSync('psql', ['-d', 'postgres', '-c', 'select 1'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

test('anon cannot read the operator row and an authenticated member can', (t) => {
  if (!psqlReady()) {
    t.skip('local psql is not available')
    return
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'ba-operator-'))
  const script = path.join(dir, 'check.sql')
  const db = `ba_operator_${process.pid}`
  const migration = path.join(root, 'supabase/migrations/20261126120000_ai_report_operator.sql')
  writeFileSync(
    script,
    `
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$roles$;
grant usage on schema public to anon, authenticated, service_role;
\\i ${migration}
set role anon;
do $$
begin
  begin
    perform 1 from public.ai_report_operator;
    raise exception 'anon_read_succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;
reset role;
set role authenticated;
do $$
declare
  found int;
begin
  select count(*) into found
  from public.ai_report_operator
  where entity = 'NAMMCO Holding Co.' and cr = '7043252647';
  if found <> 1 then
    raise exception 'authenticated_member_missing_row';
  end if;
end
$$;
`,
  )
  try {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    execFileSync('createdb', [db], { stdio: 'ignore' })
    try {
      execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      const failed = error as { stdout?: Buffer; stderr?: Buffer; message?: string }
      throw new Error(`${failed.stdout?.toString() ?? ''}\n${failed.stderr?.toString() ?? ''}\n${failed.message ?? ''}`)
    }
  } finally {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})

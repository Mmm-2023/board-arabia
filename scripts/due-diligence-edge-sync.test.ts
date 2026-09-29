import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  extractCompanyUrl,
  extractDeckFacts,
  NOT_STATED,
  presentReport,
  buildReport,
} from '../supabase/functions/_shared/due_diligence.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function specifiers(source: string): string[] {
  const withoutBlock = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const withoutLine = withoutBlock.replace(/(^|[^:])\/\/.*$/gm, '$1')
  const found: string[] = []
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of withoutLine.matchAll(pattern)) found.push(match[1] || '')
  }
  return found
}

function isRemoteSpecifier(spec: string): boolean {
  return /^(https?:|npm:|jsr:)/.test(spec) || spec.includes('esm.sh')
}

function importGraph(entry: string): string[] {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()
    if (!file || seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const spec of specifiers(source)) {
      assert.equal(isRemoteSpecifier(spec), false, `${path.relative(root, file)} imports ${spec}`)
      if (!spec.startsWith('.')) continue
      const resolved = path.resolve(path.dirname(file), spec)
      assert.equal(existsSync(resolved), true, `missing import ${spec}`)
      queue.push(resolved)
    }
  }
  return [...seen]
}

test('extract.ts boots from the vendored fflate graph with no remote import', async () => {
  const entry = path.join(root, 'supabase/functions/due-diligence-start/extract.ts')
  const files = importGraph(entry)
  const relative = files.map((file) => path.relative(root, file)).sort()
  assert.deepEqual(relative, [
    'supabase/functions/_shared/due_diligence.ts',
    'supabase/functions/_shared/fflate-browser.js',
    'supabase/functions/_shared/pdf_text.ts',
    'supabase/functions/due-diligence-start/extract.ts',
  ])
  const bundled = files.map((file) => readFileSync(file, 'utf8')).join('\n')
  assert.equal(bundled.includes('esm.sh'), false)
  assert.equal(/\bfrom\s+['"]https?:/.test(bundled), false)
  assert.equal(/\bfrom\s+['"]npm:/.test(bundled), false)
  const extract = await import('../supabase/functions/due-diligence-start/extract.ts')
  assert.equal(typeof extract.assertPptxSlides, 'function')
  assert.equal(typeof extract.textFromDeck, 'function')
  assert.throws(() => extract.assertPptxSlides(new Uint8Array([1, 2, 3, 4])), /not a PDF or PPTX/)

  const deno = spawnSync('deno', ['--version'], { encoding: 'utf8' })
  if (deno.error || deno.status !== 0) return
  const ran = spawnSync(
    'deno',
    [
      'eval',
      '--no-remote',
      '--allow-read',
      "const mod = await import('./supabase/functions/due-diligence-start/extract.ts'); if (typeof mod.assertPptxSlides !== 'function') throw new Error('extract did not boot')",
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(ran.status, 0, ran.stderr || ran.stdout)
})

test('a bank name alone does not classify a sentence as team', () => {
  const source = readFileSync(path.join(root, 'supabase/functions/_shared/due_diligence.ts'), 'utf8')
  assert.equal(/goldman sachs\|jpmorgan\|morgan stanley\|lazard\|nomura/.test(source), false)
  assert.equal(/alumni\|consortium\|goldman sachs/.test(source), false)
  const facts = extractDeckFacts(
    [
      'Northwind Logistics',
      'Goldman Sachs joined the discussion about regional expansion plans for the coming year.',
      'JPMorgan described a regional office plan without naming any person in a leadership role.',
      'Morgan Stanley hosted a breakfast about logistics corridors across the region last spring.',
      'Lazard prepared a short note on warehouse capacity for the quarterly planning meeting.',
      'Nomura circulated a memo about freight schedules for the next planning cycle.',
      'The alumni network gathered for a logistics briefing in the capital last spring.',
      'The consortium published a short briefing on freight lanes across the region last spring.',
    ].join('\n'),
  )
  assert.equal(
    facts.claims.some((claim) => claim.kind === 'team'),
    false,
  )
  const withRole = extractDeckFacts(
    'Northwind Logistics\nOur founder previously worked at Goldman Sachs before leading the logistics company.',
  )
  assert.equal(
    withRole.claims.some((claim) => claim.kind === 'team' && /goldman sachs/i.test(claim.text)),
    true,
  )
})

test('a finance phrase does not force the sector, and http or www hosts still resolve', () => {
  const facts = extractDeckFacts(
    'Northwind Logistics\nThis private equity and capital consortium note should not set a sector by itself.\nWe are raising $4 million in a seed round.',
  )
  assert.equal(facts.sector, NOT_STATED)
  assert.equal(
    extractCompanyUrl('The public home is www.northwind.example/about for customers.'),
    'https://www.northwind.example/about',
  )
  assert.equal(
    extractCompanyUrl('Older link http://northwind.example/team is still the company site.'),
    'https://northwind.example/team',
  )
  const report = buildReport(extractDeckFacts(
    'Northwind Logistics\nSector: logistics\nWe are raising $4 million in a seed round.\nNorthwind serves 120 enterprise customers across the Gulf.',
  ), [
    {
      title: 'Home',
      url: 'https://www.northwindlogistics.example/about',
      text: 'A public page with enough words to pass the length check for retrieval.',
    },
  ])
  const presented = presentReport(report, 'Northwind.pdf')
  assert.equal(presented.areas.find((area) => area.area === 'Entity and company')?.label, 'publicly_consistent')
})

import { describe, it, expect } from 'vitest'
import { parse } from '@babel/parser'
import { LANGUAGES } from '.'
import en from './en.json'

// ─── Static localization guard ───────────────────────────────────────────────
// All UI text comes from src/i18n/<lang>.json — nothing is translated at
// runtime. These checks keep it that way:
//   1. every language file has exactly the keys (and placeholders) of en.json
//   2. every key the code uses exists
//   3. no new hardcoded text in buttons, labels, tooltips, dialogs …

type Dict = { [key: string]: string | Dict }

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

function flatten(dict: Dict, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v === 'string') out.set(prefix + k, v)
    else for (const [fk, fv] of flatten(v, `${prefix}${k}.`)) out.set(fk, fv)
  }
  return out
}

const variables = (s: string) => new Set([...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]))
const tags = (s: string) => [...s.matchAll(/<\/?([a-z]+)\s*\/?>/g)].map(m => m[0]).sort().join(' ')

const EN = flatten(en as Dict)

describe('language files', () => {
  for (const lang of LANGUAGES) {
    const dict = flatten(lang.translation as Dict)
    const categories = new Intl.PluralRules(lang.code).resolvedOptions().pluralCategories

    it(`${lang.code}.json has exactly the keys of en.json`, () => {
      const base = (keys: Iterable<string>) => new Set([...keys].map(k => k.replace(PLURAL_SUFFIX, '')))
      expect([...base(dict.keys())].sort()).toEqual([...base(EN.keys())].sort())
    })

    it(`${lang.code}.json has every plural form its language needs`, () => {
      const pluralBases = new Set([...EN.keys()].filter(k => PLURAL_SUFFIX.test(k)).map(k => k.replace(PLURAL_SUFFIX, '')))
      const missing = [...pluralBases].flatMap(b => categories.filter(c => !dict.has(`${b}_${c}`)).map(c => `${b}_${c}`))
      expect(missing).toEqual([])
    })

    it(`${lang.code}.json has no empty texts and keeps every placeholder`, () => {
      const problems: string[] = []
      for (const [key, value] of dict) {
        if (!value.trim()) { problems.push(`${key}: empty`); continue }
        const ref = EN.get(key) ?? EN.get(key.replace(PLURAL_SUFFIX, '_other')) ?? EN.get(key.replace(PLURAL_SUFFIX, ''))
        if (ref === undefined) continue
        if (tags(value) !== tags(ref)) problems.push(`${key}: markup ${tags(value)} ≠ ${tags(ref)}`)
        const want = [...variables(ref)].filter(v => v !== 'count')
        const got = variables(value)
        for (const v of want) if (!got.has(v)) problems.push(`${key}: missing {{${v}}}`)
        for (const v of got) if (!variables(ref).has(v) && v !== 'count') problems.push(`${key}: unknown {{${v}}}`)
      }
      expect(problems).toEqual([])
    })
  }
})

// ─── Source files ────────────────────────────────────────────────────────────

const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true })
const FILES = Object.entries(SOURCES).map(([path, code]) => ({ path: path.replace(/^\.\.\//, ''), code }))
const NAMESPACES = Object.keys(en)

function keyExists(key: string): boolean {
  return EN.has(key) || [...EN.keys()].some(k => k.startsWith(`${key}_`) && PLURAL_SUFFIX.test(k))
}

describe('translation keys used in the code', () => {
  it('all exist in en.json', () => {
    const missing: string[] = []
    // t('key'), i18n.t('key'), i18nKey="key", <T k="key"> (help page), and
    // key constants like 'library.sortTitle' that are translated later
    const patterns = [
      /\bt\(\s*'([^'$]+)'/g,
      /i18nKey="([^"]+)"/g,
      /<T k="([^"]+)"/g,
      new RegExp(`'((?:${NAMESPACES.join('|')})\\.[A-Za-z0-9_.]+)'`, 'g'),
    ]
    for (const { path, code } of FILES) {
      for (const [i, re] of patterns.entries()) {
        for (const m of code.matchAll(re)) {
          const key = i === 2 ? `help.${m[1]}` : m[1]
          if (!keyExists(key)) missing.push(`${path}: ${key}`)
        }
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })
})

// ─── No hardcoded UI text ────────────────────────────────────────────────────

/** Brand and technical names that read the same in every language. */
const ALLOWED = new Set([
  'ChordCrew', 'ChurchTools', 'CT', 'CCLI', 'BPM', 'URL', 'WhatsApp', 'macOS', 'Windows', 'ol-a-br/chordcrew',
])
/** Attributes and props whose value is shown to the user. */
const TEXT_ATTRIBUTES = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label', 'hint'])

const hasWords = (s: string) =>
  /[A-Za-zÄÖÜäöüß]{2,}/.test(s) && !ALLOWED.has(s.trim())
  && !/^(https?:\/\/\S+|\S+@\S+\.\S+)$/.test(s.trim())   // example URLs / e-mail addresses

interface Node { type: string; [key: string]: unknown }

function walk(node: unknown, visit: (node: Node, parents: Node[]) => void, parents: Node[] = []) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach(n => walk(n, visit, parents)); return }
  const n = node as Node
  if (typeof n.type !== 'string') return
  visit(n, parents)
  for (const [key, value] of Object.entries(n)) {
    if (key !== 'loc' && key !== 'leadingComments' && key !== 'trailingComments') walk(value, visit, [...parents, n])
  }
}

function literalText(node: Node): string | null {
  if (node.type === 'StringLiteral') return node.value as string
  if (node.type === 'TemplateLiteral') return (node.quasis as { value: { cooked: string } }[]).map(q => q.value.cooked).join(' ')
  return null
}

describe('UI text', () => {
  it('comes from the language files, not from the code', () => {
    const found: string[] = []
    for (const { path, code } of FILES.filter(f => f.path.endsWith('.tsx'))) {
      const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
      const report = (node: Node, text: string) =>
        found.push(`${path}:${(node.loc as { start: { line: number } }).start.line} "${text.trim().replace(/\s+/g, ' ').slice(0, 60)}"`)

      walk(ast.program, (node, parents) => {
        // <button>Save</button>
        if (node.type === 'JSXText' && hasWords(node.value as string)) report(node, node.value as string)

        // title="Save", placeholder={'Search…'}
        if (node.type === 'JSXAttribute') {
          const name = (node.name as { name: string }).name
          const value = node.value as Node | null
          const inner = value?.type === 'JSXExpressionContainer' ? value.expression as Node : value
          const text = inner && literalText(inner)
          if (TEXT_ATTRIBUTES.has(name) && text && hasWords(text)) report(node, text)
        }

        // {cond ? 'Syncing…' : 'Sync'} as element content
        const text = literalText(node)
        if (text && hasWords(text)) {
          const chain = [...parents].reverse()
          const container = chain.findIndex(p => p.type !== 'ConditionalExpression' && p.type !== 'LogicalExpression')
          const holder = chain[container]
          if (holder?.type === 'JSXExpressionContainer' && chain[container + 1]?.type === 'JSXElement') report(node, text)
        }

        // confirm('Delete?'), alert('…')
        if (node.type === 'CallExpression') {
          const callee = node.callee as Node
          const name = callee.type === 'Identifier' ? callee.name : null
          const arg = (node.arguments as Node[])[0]
          const argText = arg && literalText(arg)
          if ((name === 'confirm' || name === 'alert') && argText && hasWords(argText)) report(node, argText)
        }
      })
    }
    expect(found, 'Move these texts to src/i18n/en.json + de.json and use t()').toEqual([])
  })
})

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation, Trans } from 'react-i18next'

// All help text lives in src/i18n/<lang>.json under "help". Inline markup in
// those strings maps to these elements: <b>bold</b>, <em>, <code> (chord-
// coloured code chip), <mono> (plain monospace) and <br/>.

interface Section {
  title: string
  content: React.ReactNode
}

function Accordion({ title, content, defaultOpen = false }: Section & { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-surface-3 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-surface-2 transition-colors"
      >
        {open ? <ChevronDown size={15} className="text-ink-muted shrink-0" /> : <ChevronRight size={15} className="text-ink-muted shrink-0" />}
        <span className="font-medium text-sm">{title}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 text-sm text-ink-muted space-y-3 border-t border-surface-3">
          {content}
        </div>
      )}
    </div>
  )
}

function Code({ children }: { children?: React.ReactNode }) {
  return <code className="bg-surface-2 text-chord px-1.5 py-0.5 rounded font-mono text-xs">{children}</code>
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="bg-surface-2 border border-surface-3 rounded-lg p-3 font-mono text-xs text-ink overflow-x-auto whitespace-pre">
      {children}
    </pre>
  )
}

const MARKUP = {
  b: <strong className="text-ink" />,
  em: <em />,
  code: <Code />,
  mono: <code className="font-mono text-xs" />,
  br: <br />,
}

/** One help text with inline markup. */
function T({ k }: { k: string }) {
  return <Trans i18nKey={`help.${k}`} components={MARKUP} />
}

const DIRECTIVES: [code: string, key: string][] = [
  ['{title: …}', 'title'],
  ['{artist: …}', 'artist'],
  ['{key: G}', 'key'],
  ['{tempo: 120}', 'tempo'],
  ['{capo: 2}', 'capo'],
  ['{time: 4/4}', 'time'],
  ['{ccli: 1234567}', 'ccli'],
  ['{copyright: © 2024}', 'copyright'],
  ['{url: https://…}', 'url'],
  ['{comment: …}', 'comment'],
  ['{start_of_part: Bridge}', 'part'],
]

const TROUBLESHOOTING = ['blank', 'orange', 'importFails', 'syncGrey', 'wakeLock']

export default function HelpPage() {
  const { t } = useTranslation()
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">{t('help.title')}</h1>
        <p className="text-sm text-ink-muted mt-1">{t('help.subtitle')}</p>
      </div>

      <Accordion defaultOpen title={t('help.start.title')} content={
        <>
          <p><T k="start.intro" /></p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li><T k="start.step1" /></li>
            <li><T k="start.step2" /></li>
            <li><T k="start.step3" /></li>
            <li><T k="start.step4" /></li>
          </ol>
          <p><T k="start.install" /></p>
        </>
      } />

      <Accordion title={t('help.chordpro.title')} content={
        <>
          <p><T k="chordpro.intro" /></p>
          <Pre>{t('help.chordpro.example')}</Pre>
          <p>{t('help.chordpro.directivesTitle')}</p>
          <ul className="space-y-1">
            {DIRECTIVES.map(([code, key]) => (
              <li key={code} className="flex gap-2"><Code>{code}</Code><span>{t(`help.chordpro.directives.${key}`)}</span></li>
            ))}
          </ul>
        </>
      } />

      <Accordion title={t('help.chordswiki.title')} content={
        <>
          <p><T k="chordswiki.intro" /></p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li><T k="chordswiki.step1" /></li>
            <li><T k="chordswiki.step2" /></li>
            <li><T k="chordswiki.step3" /></li>
            <li><T k="chordswiki.step4" /></li>
          </ol>
          <p><T k="chordswiki.flagged" /></p>
        </>
      } />

      <Accordion title={t('help.opensong.title')} content={
        <>
          <p><T k="opensong.intro" /></p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li><T k="opensong.step1" /></li>
            <li><T k="opensong.step2" /></li>
            <li><T k="opensong.step3" /></li>
            <li><T k="opensong.step4" /></li>
          </ol>
          <p><T k="opensong.sections" /></p>
        </>
      } />

      <Accordion title={t('help.performance.title')} content={
        <>
          <p><T k="performance.intro" /></p>
          <ul className="space-y-1.5">
            <li><T k="performance.arrows" /></li>
            <li><T k="performance.longRight" /></li>
            <li><T k="performance.longLeft" /></li>
            <li><T k="performance.tap" /></li>
          </ul>
          <p><T k="performance.pedal" /></p>
          <p><T k="performance.setlist" /></p>
        </>
      } />

      <Accordion title={t('help.midi.title')} content={
        <>
          <p><T k="midi.intro" /></p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li><T k="midi.step1" /></li>
            <li><T k="midi.step2" /></li>
            <li><T k="midi.step3" /></li>
          </ol>
          <Pre>{t('help.midi.example')}</Pre>
          <p><T k="midi.allRigs" /></p>
          <p><T k="midi.switches" /></p>
          <p><T k="midi.slots" /></p>
          <p><T k="midi.ipad" /></p>
        </>
      } />

      <Accordion title={t('help.teams.title')} content={
        <>
          <p><T k="teams.intro" /></p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li><T k="teams.step1" /></li>
            <li><T k="teams.step2" /></li>
            <li><T k="teams.step3" /></li>
          </ol>
          <p>{t('help.teams.rolesTitle')}</p>
          <ul className="space-y-1">
            <li><T k="teams.owner" /></li>
            <li><T k="teams.contributor" /></li>
            <li><T k="teams.reader" /></li>
          </ul>
          <p><T k="teams.share" /></p>
        </>
      } />

      <Accordion title={t('help.sync.title')} content={
        <>
          <p><T k="sync.intro" /></p>
          <ul className="space-y-1.5">
            <li><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5" />{t('help.sync.green')}</li>
            <li><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5" />{t('help.sync.yellow')}</li>
            <li><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />{t('help.sync.red')}</li>
            <li><span className="inline-block w-2 h-2 rounded-full bg-surface-3 mr-1.5" />{t('help.sync.grey')}</li>
          </ul>
          <p><T k="sync.backup" /></p>
        </>
      } />

      <Accordion title={t('help.curation.title')} content={
        <>
          <p><T k="curation.intro" /></p>
          <ul className="space-y-1.5">
            <li><T k="curation.duplicates" /></li>
            <li><T k="curation.errors" /></li>
            <li><T k="curation.export" /></li>
          </ul>
        </>
      } />

      <Accordion title={t('help.troubleshooting.title')} content={
        <ul className="space-y-2">
          {TROUBLESHOOTING.map(key => (
            <li key={key}>
              <strong className="text-ink">{t(`help.troubleshooting.${key}.problem`)}</strong><br />
              <T k={`troubleshooting.${key}.solution`} />
            </li>
          ))}
        </ul>
      } />
    </div>
  )
}

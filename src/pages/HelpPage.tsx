import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

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

function Code({ children }: { children: string }) {
  return <code className="bg-surface-2 text-chord px-1.5 py-0.5 rounded font-mono text-xs">{children}</code>
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="bg-surface-2 border border-surface-3 rounded-lg p-3 font-mono text-xs text-ink overflow-x-auto whitespace-pre">
      {children}
    </pre>
  )
}

export default function HelpPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Help & Documentation</h1>
        <p className="text-sm text-ink-muted mt-1">Getting started, ChordPro format, import guides, and more.</p>
      </div>

      <Accordion defaultOpen title="Getting Started" content={
        <>
          <p>ChordCrew is an offline-first PWA for managing ChordPro songs and setlists. All data is stored on your device — no internet required during worship.</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Go to <strong className="text-ink">Library</strong> to see your songs. Tap <strong className="text-ink">+</strong> (top-right) to create a new song.</li>
            <li>Use the <strong className="text-ink">Editor</strong> to write ChordPro content. The right panel previews the rendering live.</li>
            <li>Open a song in <strong className="text-ink">Viewer</strong> to transpose, change columns, or enter Performance mode.</li>
            <li>Build a <strong className="text-ink">Setlist</strong> and present it in full-screen mode with pedal navigation.</li>
          </ol>
          <p>To install as a PWA, use "Add to Home Screen" in your browser (Safari on iOS, Chrome on Android / desktop).</p>
        </>
      } />

      <Accordion title="ChordPro Format" content={
        <>
          <p>ChordPro places chords inline above lyrics using square brackets.</p>
          <Pre>{`{title: Amazing Grace}
{artist: John Newton}
{key: G}
{tempo: 72}

{start_of_verse: Verse 1}
[G]Amazing [C]grace, how [G]sweet the sound
[G]That saved a [D]wretch like [G]me
{end_of_verse}

{start_of_chorus: Chorus}
[G]My chains are [C]gone, I've been set [G]free
{end_of_chorus}`}</Pre>
          <p>Useful directives:</p>
          <ul className="space-y-1">
            {[
              ['{title: …}', 'Song title'],
              ['{artist: …}', 'Artist / songwriter'],
              ['{key: G}', 'Key shown in toolbar'],
              ['{tempo: 120}', 'BPM shown in toolbar'],
              ['{capo: 2}', 'Capo hint shown in Viewer'],
              ['{time: 4/4}', 'Time signature'],
              ['{ccli: 1234567}', 'CCLI number (links to SongSelect)'],
              ['{copyright: © 2024}', 'Copyright line'],
              ['{url: https://…}', 'External link (YouTube, etc.)'],
              ['{comment: …}', 'Italic comment/note line'],
              ['{start_of_part: Bridge}', 'Section (chords.wiki extension)'],
            ].map(([code, desc]) => (
              <li key={code} className="flex gap-2"><Code>{code as string}</Code><span>{desc}</span></li>
            ))}
          </ul>
        </>
      } />

      <Accordion title="Migrating from chords.wiki" content={
        <>
          <p>Export your library from chords.wiki: <strong className="text-ink">Settings → Export → Library backup (JSON)</strong>.</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>In ChordCrew, go to <strong className="text-ink">Import</strong>.</li>
            <li>Drop the <code className="font-mono text-xs">.json</code> file onto the upload area (or click to browse).</li>
            <li>If songs already exist you can <em>Skip</em> or <em>Overwrite</em> them.</li>
            <li>Books, songs, and setlists are all imported in one step.</li>
          </ol>
          <p>Songs with filename-style titles (e.g. <Code>my_song.cho</Code>) are flagged in the import summary for cleanup.</p>
        </>
      } />

      <Accordion title="Migrating from OpenSong" content={
        <>
          <p>OpenSong stores songs as XML files (no extension). ChordCrew can import them directly.</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Go to <strong className="text-ink">Import → OpenSong</strong> tab.</li>
            <li>Select one or more OpenSong XML files (multi-select is supported).</li>
            <li>ChordCrew converts positional chord alignment to ChordPro inline format.</li>
            <li>Key, tempo, time signature, CCLI, and copyright are extracted automatically — including when they appear as inline text in the lyrics (<Code>Key - G | Tempo - 72</Code>).</li>
          </ol>
          <p>Section types are mapped: <Code>V</Code> → Verse, <Code>C</Code> → Chorus, <Code>B</Code> → Bridge, <Code>P</Code> → Pre-Chorus, <Code>T</Code> → Tag.</p>
        </>
      } />

      <Accordion title="Performance Mode & Pedal Navigation" content={
        <>
          <p>Enter Performance mode from any song's Viewer toolbar (↕ icon). The screen stays on and all sync is disabled.</p>
          <ul className="space-y-1.5">
            <li><strong className="text-ink">Arrow Right / Left</strong> — advance / go back one column</li>
            <li><strong className="text-ink">Long-press Right</strong> — skip to next song in setlist</li>
            <li><strong className="text-ink">Long-press Left</strong> — back to start of current song</li>
            <li><strong className="text-ink">Tap left/right half</strong> — same as arrow keys (touch)</li>
          </ul>
          <p>Compatible pedal: <strong className="text-ink">PageFlip Cicada V7</strong> in Mode 2 (emits Left/Right Arrow). Reassign pedal keys in <strong className="text-ink">Settings → Pedal</strong>.</p>
          <p>In a setlist, reaching the last column of a song advances to the next song automatically.</p>
        </>
      } />

      <Accordion title="Teams & Shared Libraries" content={
        <>
          <p>Teams let you share songs and setlists with your worship band. Requires Google Sign-In.</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Go to <strong className="text-ink">Teams</strong> and create a team.</li>
            <li>Invite members by their Google email address.</li>
            <li>They accept via the notification banner at the top of the screen.</li>
          </ol>
          <p>Roles:</p>
          <ul className="space-y-1">
            <li><strong className="text-ink">Owner</strong> — full admin: invite, remove, change roles, edit everything</li>
            <li><strong className="text-ink">Contributor</strong> — add and edit songs / setlists</li>
            <li><strong className="text-ink">Reader</strong> — view and transpose; cannot edit</li>
          </ul>
          <p>To share your personal songs: select songs in Library → <strong className="text-ink">Organize → Copy/Move to team</strong>.</p>
        </>
      } />

      <Accordion title="Sync & Backup" content={
        <>
          <p>Sync is <strong className="text-ink">manual only</strong> — tap the sync badge in the sidebar or <strong className="text-ink">Settings → Sync Now</strong>.</p>
          <ul className="space-y-1.5">
            <li><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5" />Green — synced</li>
            <li><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5" />Yellow — unsynced changes or updates available</li>
            <li><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />Red — sync error</li>
            <li><span className="inline-block w-2 h-2 rounded-full bg-surface-3 mr-1.5" />Grey — offline</li>
          </ul>
          <p>To back up your library: go to <strong className="text-ink">Import → Export</strong> to download a chords.wiki-compatible JSON file. Re-import it on any device.</p>
        </>
      } />

      <Accordion title="Library Curation" content={
        <>
          <p>The <strong className="text-ink">Curation</strong> page (sidebar) helps you keep your library tidy.</p>
          <ul className="space-y-1.5">
            <li><strong className="text-ink">Duplicates</strong> — finds songs with identical or very similar titles (≥ 75% word overlap). Click <em>Edit</em> to open the song.</li>
            <li><strong className="text-ink">Parse Errors</strong> — scans all songs for unclosed braces or brackets. Click <em>Fix →</em> to jump to the editor.</li>
            <li><strong className="text-ink">Export CSV</strong> — downloads all song metadata (title, artist, key, tempo, tags, CCLI, copyright, book) as a CSV file.</li>
          </ul>
        </>
      } />

      <Accordion title="Troubleshooting" content={
        <>
          <ul className="space-y-2">
            <li>
              <strong className="text-ink">Song renders blank or shows "Parse Error"</strong><br />
              Open the song in the Editor — the Preview panel highlights parse errors with line numbers. Use <em>Fix →</em> to jump to the problem line.
            </li>
            <li>
              <strong className="text-ink">Chords show in orange in the editor</strong><br />
              Orange underline = unknown chord name. Check the spelling — ChordCrew only recognises standard notation (A–G, no German H).
            </li>
            <li>
              <strong className="text-ink">Import fails with "Not a chords.wiki library-backup file"</strong><br />
              Make sure you exported the full <em>library backup</em> (not individual song exports) from chords.wiki.
            </li>
            <li>
              <strong className="text-ink">Sync button is greyed out</strong><br />
              The app is offline or Firebase is not configured. Sync requires an internet connection and a valid Firebase project.
            </li>
            <li>
              <strong className="text-ink">Wake lock not working in Performance mode</strong><br />
              Wake Lock API requires the page to be served over HTTPS. It is also not supported in Firefox.
            </li>
          </ul>
        </>
      } />
    </div>
  )
}

import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Save, Eye, X, RotateCcw, Tag } from 'lucide-react'
import { db, upsertSongVersions, markPending } from '@/db'
import { buildSearchText, extractMeta } from '@/utils/chordpro'
import { ChordProEditor } from '@/components/editor/ChordProEditor'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { Button } from '@/components/shared/Button'
import { useAuth } from '@/auth/AuthContext'

/** Replace or insert a ChordPro directive in the content string. */
function updateDirective(content: string, directive: string, value: string): string {
  const re = new RegExp(`\\{${directive}\\s*:[^}]*\\}`, 'gi')
  if (re.test(content)) {
    return content.replace(re, value.trim() ? `{${directive}: ${value}}` : '')
  }
  if (!value.trim()) return content
  return `{${directive}: ${value}}\n${content}`
}

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const song = useLiveQuery(() => id ? db.songs.get(id) : undefined, [id])

  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Derive metadata from content for display; updated reactively
  const derivedMeta = useMemo(() => extractMeta(content), [content])

  useEffect(() => {
    if (song) {
      setContent(song.transcription.content)
      setTags(song.tags ?? [])
    }
  }, [song?.id])

  const commitMetaField = (directive: string, value: string) => {
    setContent(prev => {
      const updated = updateDirective(prev, directive, value)
      setDirty(true)
      return updated
    })
  }

  const handleChange = (val: string) => {
    setContent(val)
    setDirty(true)
  }

  const save = async () => {
    if (!song || !user) return
    const meta = extractMeta(content)
    await upsertSongVersions(song.id, song.transcription.content, user.id, user.displayName)
    await db.songs.update(song.id, {
      title:      meta.title ?? song.title,
      artist:     meta.artist ?? song.artist,
      tags,
      searchText: buildSearchText(meta.title ?? song.title, meta.artist ?? song.artist, tags, content),
      updatedAt:  Date.now(),
      transcription: {
        ...song.transcription,
        content,
        key:           meta.key ?? song.transcription.key,
        tempo:         meta.tempo ?? song.transcription.tempo,
        capo:          meta.capo ?? song.transcription.capo,
        timeSignature: meta.time ?? song.transcription.timeSignature,
      },
    })
    await markPending('song', song.id)
    setDirty(false)
  }

  const addTag = (value: string) => {
    const tag = value.trim().toLowerCase()
    if (!tag || tags.includes(tag)) return
    const newTags = [...tags, tag]
    setTags(newTags)
    setDirty(true)
  }

  const removeTag = (tag: string) => {
    setTags(t => {
      const updated = t.filter(x => x !== tag)
      setDirty(true)
      return updated
    })
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input.value)
      input.value = ''
    } else if (e.key === 'Backspace' && input.value === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  if (!song) return <div className="p-8 text-ink-muted">Loading…</div>

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-3 bg-surface-1 shrink-0">
        <button onClick={() => navigate(-1)} className="text-ink-muted hover:text-ink">
          <X size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm truncate">{song.title}</span>
          {dirty && <span className="ml-2 text-xs text-ink-faint">unsaved</span>}
        </div>
        <button
          onClick={() => setShowPreview(p => !p)}
          className={`p-1.5 rounded ${showPreview ? 'text-chord' : 'text-ink-muted hover:text-ink'}`}
          title="Toggle preview"
        >
          <Eye size={17} />
        </button>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/view/${song.id}`)}>
          <RotateCcw size={14} />
          View
        </Button>
        <Button variant="primary" size="sm" onClick={save} disabled={!dirty}>
          <Save size={14} />
          Save
        </Button>
      </div>

      {/* Metadata bar — song fields */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-surface-3 bg-surface-1 shrink-0 flex-wrap">
        {([
          { label: 'Title',  directive: 'title',  value: derivedMeta.title  ?? '', width: 'w-36', type: 'text' },
          { label: 'Artist', directive: 'artist', value: derivedMeta.artist ?? '', width: 'w-28', type: 'text' },
          { label: 'Key',    directive: 'key',    value: derivedMeta.key    ?? '', width: 'w-12', type: 'text' },
          { label: 'Tempo',  directive: 'tempo',  value: derivedMeta.tempo  ? String(derivedMeta.tempo) : '', width: 'w-14', type: 'number' },
          { label: 'Capo',   directive: 'capo',   value: derivedMeta.capo   ? String(derivedMeta.capo)  : '', width: 'w-12', type: 'number' },
          { label: 'Time',   directive: 'time',   value: derivedMeta.time   ?? '', width: 'w-14', type: 'text' },
        ]).map(({ label, directive, value, width, type }) => (
          <label key={directive} className="flex items-center gap-1 text-xs">
            <span className="text-ink-faint shrink-0">{label}</span>
            <input
              type={type ?? 'text'}
              defaultValue={value}
              key={`${directive}-${song?.id}-${value}`}
              onBlur={e => commitMetaField(directive, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              className={`${width} bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5 text-ink text-xs outline-none focus:border-chord/50`}
            />
          </label>
        ))}
      </div>

      {/* Metadata bar — tags */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-surface-3 bg-surface-1 shrink-0">
        <Tag size={13} className="text-ink-faint shrink-0" />
        <div className="flex flex-wrap items-center gap-1 flex-1">
          {tags.map(tag => (
            <span
              key={tag}
              className="flex items-center gap-1 bg-surface-3 text-ink-muted text-xs px-2 py-0.5 rounded-full"
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="text-ink-faint hover:text-ink leading-none"
                title="Remove tag"
              >
                ✕
              </button>
            </span>
          ))}
          <input
            ref={tagInputRef}
            type="text"
            placeholder={tags.length === 0 ? 'add tags (press Enter or ,)' : 'add tag…'}
            className="bg-transparent text-xs text-ink placeholder:text-ink-faint outline-none min-w-[100px] py-0.5"
            onKeyDown={handleTagKeyDown}
            onBlur={e => { if (e.target.value.trim()) { addTag(e.target.value); e.target.value = '' } }}
          />
        </div>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 min-h-0">
        {/* Editor */}
        <div className={`flex flex-col min-h-0 ${showPreview ? 'w-1/2' : 'w-full'}`}>
          <ChordProEditor value={content} onChange={handleChange} />
        </div>

        {/* Preview */}
        {showPreview && (
          <>
            <div className="w-px bg-surface-3 shrink-0" />
            <div className="flex-1 overflow-y-auto p-6">
              <SongRenderer content={content} columns={1} fontScale={0.95} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

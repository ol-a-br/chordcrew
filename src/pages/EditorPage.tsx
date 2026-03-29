import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Save, Eye, X, RotateCcw } from 'lucide-react'
import { db, upsertSongVersions, markPending } from '@/db'
import { buildSearchText, extractMeta } from '@/utils/chordpro'
import { ChordProEditor } from '@/components/editor/ChordProEditor'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { Button } from '@/components/shared/Button'
import { useAuth } from '@/auth/AuthContext'

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const song = useLiveQuery(() => id ? db.songs.get(id) : undefined, [id])

  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [showPreview, setShowPreview] = useState(true)

  useEffect(() => {
    if (song) setContent(song.transcription.content)
  }, [song?.id]) // only on mount/song change, not every keystroke

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
      searchText: buildSearchText(meta.title ?? song.title, meta.artist ?? song.artist, song.tags, content),
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

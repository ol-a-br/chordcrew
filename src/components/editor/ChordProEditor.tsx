import { useEffect, useRef, useCallback } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { StreamLanguage } from '@codemirror/language'

// Simple ChordPro syntax highlighter via StreamLanguage
const chordProLanguage = StreamLanguage.define({
  name: 'chordpro',
  token(stream) {
    if (stream.match(/^\{[^}]*\}/)) return 'keyword'       // {directive}
    if (stream.match(/^\[[^\]]{1,30}\]/)) return 'string'  // [Chord] or [Section]
    if (stream.match(/^#.*/)) return 'comment'             // # editor comment
    stream.next()
    return null
  },
})

interface ChordProEditorProps {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
}

export function ChordProEditor({ value, onChange, readOnly = false }: ChordProEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const initEditor = useCallback(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        lineNumbers(),
        chordProLanguage,
        oneDark,
        updateListener,
        EditorView.editable.of(!readOnly),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { fontFamily: "'JetBrains Mono', monospace", overflow: 'auto' },
          '.cm-content': { padding: '12px 0' },
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    return view
  }, []) // eslint-disable-line

  useEffect(() => {
    const view = initEditor()
    return () => view?.destroy()
  }, [initEditor])

  // Sync external value changes (e.g. undo/restore)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden rounded-lg border border-surface-3"
    />
  )
}

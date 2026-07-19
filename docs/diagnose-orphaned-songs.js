/**
 * Paste this into the browser DevTools console (on any ChordCrew page) to
 * diagnose songs whose bookId has no matching book record in IndexedDB.
 *
 * Output sections:
 *  • ORPHANED SONGS  — songs whose bookId doesn't exist in the books store
 *  • CT ORPHANS      — subset that are ChurchTools songs (have ctSongId)
 *  • ALL BOOKS       — every book currently in IDB (for cross-reference)
 */
(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('ChordCrewDB')
    req.onsuccess = e => resolve(e.target.result)
    req.onerror  = () => reject(req.error)
  })

  const getAll = store => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll()
    req.onsuccess = e => resolve(e.target.result)
    req.onerror  = () => reject(req.error)
  })

  const [songs, books] = await Promise.all([getAll('songs'), getAll('books')])
  const bookIds = new Set(books.map(b => b.id))

  const orphans = songs.filter(s => !bookIds.has(s.bookId))
  const ctOrphans = orphans.filter(s => s.ctSongId != null)

  console.group('%c ChordCrew IDB Diagnostic', 'color:#f59e0b;font-weight:bold;font-size:14px')

  console.group(`ALL BOOKS (${books.length})`)
  books.forEach(b =>
    console.log(`  [${b.sourceType ?? 'personal'}] id=${b.id}  title="${b.title}"`)
  )
  console.groupEnd()

  console.group(`ORPHANED SONGS — bookId missing from books store (${orphans.length} of ${songs.length})`)
  if (orphans.length === 0) {
    console.log('  ✓ No orphaned songs found.')
  } else {
    orphans.forEach(s =>
      console.log(
        `  id=${s.id}  bookId=${s.bookId}  title="${s.title}"` +
        (s.ctSongId != null ? `  ctSongId=${s.ctSongId}` : '')
      )
    )
  }
  console.groupEnd()

  if (ctOrphans.length > 0) {
    console.group(`CT ORPHANS — ChurchTools songs with no CT book (${ctOrphans.length})`)
    const missingCtBookIds = [...new Set(ctOrphans.map(s => s.bookId))]
    console.log('Missing CT book IDs:', missingCtBookIds)
    console.log('Tip: Run CT Sync in Settings to recreate the CT book and reassign these songs.')
    console.groupEnd()
  }

  console.log('%c Summary', 'font-weight:bold',
    `| books=${books.length} | songs=${songs.length} | orphans=${orphans.length} | ct-orphans=${ctOrphans.length}`)
  console.groupEnd()
})()

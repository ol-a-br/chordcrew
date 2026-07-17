#!/usr/bin/env node
/**
 * Export all user feedback from Firestore to a CSV file.
 *
 * Usage:
 *   # Set GOOGLE_APPLICATION_CREDENTIALS to your service account key file:
 *   export GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json
 *
 *   # Run:
 *   node scripts/export-feedback.mjs                    # → feedback.csv
 *   node scripts/export-feedback.mjs output.csv         # → output.csv
 *
 * Requires firebase-admin (npx will auto-install if not present):
 *   npm install --save-dev firebase-admin
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { writeFileSync } from 'fs'

// ── Init Firebase Admin ──────────────────────────────────────────────────────

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'Error: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.\n' +
    'Download a service account key from Firebase Console → Project Settings → Service Accounts,\n' +
    'then run:\n\n' +
    '  export GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json\n' +
    '  node scripts/export-feedback.mjs\n'
  )
  process.exit(1)
}

if (getApps().length === 0) {
  initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) })
}

const db = getFirestore()

// ── Fetch feedback ───────────────────────────────────────────────────────────

console.log('Fetching feedback from Firestore…')
const snapshot = await db.collection('feedback').orderBy('submittedAt', 'desc').get()

if (snapshot.empty) {
  console.log('No feedback found.')
  process.exit(0)
}

console.log(`Found ${snapshot.size} feedback entries.`)

// ── Build CSV ────────────────────────────────────────────────────────────────

const csvHeaders = ['date', 'stars', 'category', 'message', 'userId', 'userEmail', 'displayName', 'appVersion', 'language']

function escapeCsv(value) {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const rows = [csvHeaders.join(',')]

for (const doc of snapshot.docs) {
  const d = doc.data()
  const date = d.submittedAt ? new Date(d.submittedAt).toISOString() : ''
  const row = [
    date,
    d.stars ?? '',
    d.category ?? '',
    d.message ?? '',
    d.userId ?? '',
    d.userEmail ?? '',
    d.displayName ?? '',
    d.appVersion ?? '',
    d.language ?? '',
  ].map(escapeCsv)
  rows.push(row.join(','))
}

// ── Write file ───────────────────────────────────────────────────────────────

const outPath = process.argv[2] || 'feedback.csv'
writeFileSync(outPath, rows.join('\n') + '\n', 'utf-8')
console.log(`Exported ${snapshot.size} entries to ${outPath}`)

# ChordCrew

> Worship team chord & lyrics app — online and offline. Built on ChordPro, Firebase, and React.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features (Phase 1)

- 📖 ChordPro editor with live split-pane preview
- 🎵 Full chords.wiki extended ChordPro spec
- 🌙 Dark mode — optimised for stage use
- 📴 Offline-first (IndexedDB via Dexie — data never lost)
- 📥 One-click chords.wiki JSON library import (298 songs, 88 setlists)
- 🔀 Transpose (display-only, source never mutated)
- 🎤 Lyrics-only mode for vocalists
- 🦶 PageFlip Cicada V7 pedal support (Left/Right Arrow mode)
- 🌍 English and German UI

## Tech Stack

| Layer | Library |
|-------|---------|
| Frontend | React 18 + TypeScript + Tailwind CSS |
| ChordPro | chordsheetjs |
| Local DB | Dexie.js (IndexedDB) |
| Editor | CodeMirror 6 |
| Auth | Firebase Auth (Google) |
| Cloud DB | Firestore |
| Hosting | Firebase Hosting |
| PWA | Workbox via vite-plugin-pwa |
| CI/CD | GitHub Actions |

## Getting Started

### 1. Clone

```bash
git clone https://github.com/ol-a-br/chordcrew.git
cd chordcrew
npm install
```

### 2. Firebase setup

1. Go to [Firebase Console](https://console.firebase.google.com) → Create project → name it `chordcrew`
2. Add a **Web app** → copy the config values
3. Enable **Authentication** → Sign-in method → Google
4. Enable **Firestore Database** → Start in test mode (lock down rules before going live)

```bash
cp .env.example .env.local
# Fill in your Firebase values in .env.local
```

### 3. Run locally

```bash
npm run dev
# → http://localhost:5173
```

The app works fully offline even without Firebase configured — it runs in local-only mode.

### 4. Deploy to Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase use chordcrew       # matches .firebaserc
npm run build
npm run deploy
```

### 5. Custom domain (chordcrew.app)

After first deploy:

1. Firebase Console → Hosting → Add custom domain → `chordcrew.app`
2. Firebase gives you two `A` records — add them to Namecheap:
   - **Type:** A · **Host:** @ · **Value:** `<Firebase IP 1>`
   - **Type:** A · **Host:** @ · **Value:** `<Firebase IP 2>`
   - **Type:** CNAME · **Host:** www · **Value:** `chordcrew.web.app`
3. Also set Namecheap DNS to **Custom DNS** (not BasicDNS)
4. SSL certificate is issued automatically by Firebase within ~24h

### 6. GitHub Actions CI/CD

Add these secrets to your GitHub repo (Settings → Secrets → Actions):

| Secret | Where to get it |
|--------|----------------|
| `VITE_FIREBASE_API_KEY` | Firebase Console → Project Settings → Web app |
| `VITE_FIREBASE_AUTH_DOMAIN` | same |
| `VITE_FIREBASE_PROJECT_ID` | same |
| `VITE_FIREBASE_STORAGE_BUCKET` | same |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | same |
| `VITE_FIREBASE_APP_ID` | same |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Project Settings → Service accounts → Generate new private key |

Every push to `main` triggers a live deploy. PRs get a preview channel URL.

## Bluetooth Pedal (PageFlip Cicada V7)

1. Power on the Cicada and pair it to your device via Bluetooth settings
2. Press **Mode button 2** (Left/Right Arrow mode) — the LEDs confirm the mode
3. Open ChordCrew in Performance mode — pedals work immediately:
   - **Right pedal** → next column / next song
   - **Left pedal** → previous column
4. To reassign keys: **Settings → Pedal → click button → press pedal**

## Importing from chords.wiki

1. In chords.wiki: **Menu → Export library → Download JSON**
2. In ChordCrew: **Import → drop the JSON file**
3. Your books, songs, and setlists appear in the library instantly

## Project Structure

```
src/
  auth/           Firebase Auth context + Google login
  db/             Dexie schema + query helpers
  firebase/       Firebase initialisation
  hooks/          useKeyboard (pedal nav)
  i18n/           EN + DE translations
  utils/          ChordPro parse/render/transpose
  components/
    auth/         Login screen
    layout/       AppShell + sidebar
    editor/       CodeMirror ChordPro editor
    viewer/       Song renderer (HTML output)
    import/       chords.wiki importer
    shared/       Button, etc.
  pages/          Route-level page components
```

## Roadmap

See the [Product Spec](docs/ChordCrew_ProductSpec_v0.3.md) for the full roadmap.

- **Phase 1** (current): Core editor, viewer, import ✅
- **Phase 2**: Setlists, Performance mode, metronome, PDF export
- **Phase 3**: Firebase sync, team collaboration
- **Phase 4**: Version history, Viewer role, polish

## Licence

MIT — see [LICENSE](LICENSE)

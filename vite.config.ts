import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// In dev, proxy /ct-api/* through the Firebase Functions emulator.
// Start the emulator with: firebase emulators:start --only functions
// The emulator URL is: http://localhost:5001/{project}/{region}/{fn}
const FUNCTIONS_EMULATOR = 'http://localhost:5001'
const FIREBASE_PROJECT = 'chordcrew-50c55'
const CT_PROXY_FN = `${FUNCTIONS_EMULATOR}/${FIREBASE_PROJECT}/europe-west1/ctProxy`

export default defineConfig({
  server: {
    proxy: {
      '/ct-api': {
        target: CT_PROXY_FN,
        changeOrigin: true,
        rewrite: path => path, // keep /ct-api prefix — the function strips it
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'ChordCrew',
        short_name: 'ChordCrew',
        description: 'Worship team chord & lyrics, online and offline',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // SPA fallback: serve index.html for all navigation requests that don't
        // match a cached file. Without this, deep links (e.g. /setlists/:id)
        // return 404 when the installed PWA or a hard-reload intercepts the request.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ct-api\//, /\.json$/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          }
        ]
      }
    })
  ],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: { '@': '/src' }
  }
})

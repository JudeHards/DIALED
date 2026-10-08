import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Consume shared TypeScript directly in Vite; Express uses its compiled CommonJS build.
  resolve: { alias: { '@dialed/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) } },
  build: { rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'] } } } },
  test: { environment: 'node', include: ['test/**/*.test.{js,jsx}', 'src/**/*.test.{js,jsx}'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      workbox: { navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/health(?:\/|$)/] },
      includeAssets: ['icon-192.svg', 'icon-512.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dialed - Workout Tracker',
        short_name: 'Dialed',
        description: 'Your training, simplified. Track workouts and manage routines.',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})

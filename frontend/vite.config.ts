import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/Heat_Shield_AI/' : '/',
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Only React is forced into a named chunk. `manualChunks` entries are
        // treated as entry-like by Rollup, so listing chart.js there made Vite
        // emit `<link rel="modulepreload">` for the whole 148 kB chart vendor in
        // the dashboard's index.html — every visitor downloaded Chart.js even
        // though only the lazily loaded metric view needs it. Chart.js and
        // Leaflet now sit inside whatever lazy chunk imports them (or a shared
        // lazy chunk when more than one does), so they are fetched on demand.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})

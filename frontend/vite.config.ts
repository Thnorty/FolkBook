/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // In development the API runs on its own port; the browser only talks to Vite.
    // Keep the browser's Host header, or Django's CSRF check rejects the Origin.
    // `vite preview` uses this proxy too; the end-to-end tests point it at their own backend.
    proxy: {
      '/api': { target: process.env.FOLKBOOK_API ?? 'http://localhost:8000', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Playwright runs those, against the real app.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Whole-app tests type into forms key by key; with every file running at once on a
    // busy machine, the longest ones pass 5s.
    testTimeout: 15_000,
  },
})

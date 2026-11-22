/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { yamlRoutinePlugin } from './build/yamlRoutinePlugin.ts';

export default defineConfig({
  plugins: [
    yamlRoutinePlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Nutrition Tracker',
        short_name: 'Nutrition',
        description: 'Track food, water and daily targets.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#1b4d3e',
        background_color: '#f2f4ef',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: { navigateFallback: '/index.html' },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
  },
});

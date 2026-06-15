import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// A fresh id on every build. Baked into the bundle (and therefore the service
// worker) so each deploy is unambiguously a new version, and shown in-app so
// you can verify which build an iOS device is actually running.
const buildId = `${pkg.version}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`;

export default defineConfig({
  base: '/bricabrac/',
  define: {
    __APP_VERSION__: JSON.stringify(buildId)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // We register the service worker ourselves in main.tsx so we can add an
      // on-foreground update check (essential for iOS standalone PWAs).
      injectRegister: false,
      manifest: {
        id: '/bricabrac/',
        name: 'Bric-à-brac',
        short_name: 'Bric-à-brac',
        description: 'Flea market sales companion',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        start_url: '/bricabrac/',
        scope: '/bricabrac/',
        icons: [
          { src: 'icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // Drop precaches from previous builds instead of letting them pile up.
        cleanupOutdatedCaches: true,
        // Take control immediately so a refreshed SW serves the new assets.
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**']
  }
});

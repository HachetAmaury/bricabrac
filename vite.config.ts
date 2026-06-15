import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/bricabrac/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}']
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

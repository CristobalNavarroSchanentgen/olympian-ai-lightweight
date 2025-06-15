import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/',  // Ensure base path is set to root
  build: {
    outDir: 'dist',  // Explicitly set output directory
    emptyOutDir: true,  // Clean the output directory before building
    sourcemap: false,  // Disable sourcemaps for production
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@olympian/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
});
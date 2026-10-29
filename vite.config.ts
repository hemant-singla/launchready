/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://hemant-singla.github.io/launchready/ in production.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/launchready/' : '/',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));

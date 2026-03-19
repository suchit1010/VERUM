import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'stream']
    }),
    wasm(),
    topLevelAwait()
  ],
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['@orca-so/whirlpools-core', '@orca-so/whirlpools', '@deaura/limitless-sdk'],
    esbuildOptions: {
      target: 'esnext'
    }
  }
});

import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
const config: UserConfig & {
  test: { environment: string; include: string[] };
} = {
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'functions/**/*.test.ts'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom)\//.test(id)) return 'vendor';
          if (id.includes('/node_modules/lucide-react/')) return 'ui';
          if (id.includes('/node_modules/recharts/')) return 'charts';
        },
      },
    },
    sourcemap: false,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
};

export default defineConfig(config);

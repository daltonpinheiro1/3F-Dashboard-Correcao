import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
const config: UserConfig & {
  test: { environment: string; include: string[] };
} = {
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'functions/**/*.test.ts', 'shared/**/*.test.ts'],
  },
  build: {
    rolldownOptions: {
      output: {
        // Grupos recursivos puxam dependências: o vendor precisa vir antes para o React não cair em charts.
        codeSplitting: {
          groups: [
            {
              name: 'vendor',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|zustand)[\\/]/,
              priority: 30,
            },
            { name: 'ui', test: /[\\/]node_modules[\\/]lucide-react[\\/]/, priority: 20 },
            {
              name: 'charts',
              test: /[\\/]node_modules[\\/](recharts|recharts-scale|react-smooth|victory-vendor|d3-[^\\/]+)[\\/]/,
              priority: 10,
            },
          ],
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

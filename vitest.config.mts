import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 依赖真实 Supabase 的集成测试默认跳过，需 TROVE_TEST_* 环境变量才启用。
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
});

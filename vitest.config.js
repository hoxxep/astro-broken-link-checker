// vitest.config.js

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    coverage: {
      provider: 'v8',
    },
  },
});

import { defineConfig } from 'vitest/config';
import { zeitzeuge } from '@zeitzeuge/vitest';

export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
  plugins: [zeitzeuge()],
});

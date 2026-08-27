import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test files live next to the code they cover: foo.js -> foo.test.js
    include: ['shared/**/*.test.js', 'src/**/*.test.{js,jsx}', 'api/**/*.test.js'],
    environment: 'node',
  },
});

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The portal's first test harness. Added for the claim-audit banner, which is
// the one piece of portal UI whose absence is a safety problem rather than a
// cosmetic one: a brief with findings that renders no banner sends an AE into a
// customer meeting with a fabricated claim they have no reason to doubt.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});

import { defineConfig } from 'tsup';
import path from 'path';

export default defineConfig({
  entry: ['index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  // @prisma/client is resolved from the root node_modules at runtime
  // (where prisma generate places the generated client)
  external: ['@prisma/client'],
  esbuildOptions(options) {
    // Resolve @/ path alias to the repo root so imports from lib/db/* work
    options.alias = {
      '@': path.join(process.cwd(), '..'),
    };
  },
});

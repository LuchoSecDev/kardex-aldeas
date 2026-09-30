import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Las pruebas de integración necesitan la URL y la anon key de Supabase: se
// leen de .env.local, igual que la app.
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    env: loadEnv(mode, process.cwd(), "NEXT_PUBLIC_"),
    testTimeout: 30_000,
  },
}));

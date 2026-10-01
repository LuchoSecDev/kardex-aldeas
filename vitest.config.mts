import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Las pruebas de integración necesitan la URL y la anon key de Supabase: se
// leen de .env.local, igual que la app. PROVISION_KEY (clave para crear comunidades de
// prueba, ver planes/005) también vive ahí y NUNCA llega al navegador (no empieza por NEXT_PUBLIC_).
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    env: loadEnv(mode, process.cwd(), ["NEXT_PUBLIC_", "ADMIN_TEST_", "PROVISION_"]),
    testTimeout: 30_000,
  },
}));

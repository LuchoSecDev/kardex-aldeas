import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Plan 010: la app se publica como sitio ESTÁTICO (sin servidor) en un hosting gratuito; solo se paga la base de datos.
// Estas guardas avisan si alguien agrega algo que exige un servidor o quita las cabeceras de seguridad.
const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const archivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : [p];
  });

describe("sitio estático (sin servidor)", () => {
  it("next.config.ts exporta el sitio como archivos estáticos", () => {
    const sinComentarios = read("next.config.ts").split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(sinComentarios).toMatch(/output:\s*"export"/);
  });

  it("src/ no usa nada que necesite un servidor: rutas API, acciones de servidor, cookies/headers, middleware", () => {
    const src = archivos(path.join(ROOT, "src"));
    const rutasApi = src.filter((f) => /[\\/](route|middleware|proxy)\.(ts|js)$/.test(f));
    expect(rutasApi.map((f) => path.relative(ROOT, f))).toEqual([]);

    const prohibido = /["']use server["']|from ["']next\/headers["']|NextResponse|NextRequest|export const dynamic\s*=\s*["']force-dynamic|export const revalidate/;
    const culpables = src.filter((f) => /\.(ts|tsx)$/.test(f) && prohibido.test(readFileSync(f, "utf8")));
    expect(culpables.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("el CI comprueba que el build deja index.html y admin.html en out/", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain("out/index.html");
    expect(ci).toContain("out/admin.html");
  });
});

describe("public/_headers (Cloudflare Pages)", () => {
  const headers = read("public/_headers");
  // Bloques: una línea sin sangría que empieza con «/» y las cabeceras (con sangría) que le siguen.
  const bloques = new Map<string, string>();
  let actual = "";
  for (const linea of headers.split(/\r?\n/)) {
    if (/^\//.test(linea)) {
      actual = linea.trim();
      bloques.set(actual, "");
    } else if (actual && /^\s+\S/.test(linea)) {
      bloques.set(actual, bloques.get(actual) + linea.trim() + "\n");
    }
  }

  it("todas las páginas llevan las cabeceras de seguridad básicas", () => {
    const todas = bloques.get("/*") ?? "";
    expect(todas).toContain("X-Content-Type-Options: nosniff");
    expect(todas).toContain("X-Frame-Options: DENY");
    expect(todas).toContain("Referrer-Policy:");
    expect(todas).toContain("Permissions-Policy:");
  });

  it("la política de contenido permite solo lo que la app usa y NO permite eval", () => {
    const csp = (bloques.get("/*") ?? "").match(/Content-Security-Policy: (.*)/)?.[1] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' https://*.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("fonts.googleapis.com");
    expect(csp).toContain("fonts.gstatic.com");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/(?:default|script|connect)-src[^;]*\*(?!\.supabase\.co)/); // ningún comodín abierto
  });

  it("el panel de la nutricionista no se indexa y los archivos con huella se guardan un año", () => {
    expect(bloques.get("/admin")).toContain("X-Robots-Tag: noindex");
    expect(bloques.get("/_next/static/*")).toContain("immutable");
  });

  it("no quedan imágenes de plantilla sin usar en public/", () => {
    const usadas = archivos(path.join(ROOT, "src")).map((f) => readFileSync(f, "utf8")).join("\n");
    for (const f of readdirSync(path.join(ROOT, "public")).filter((n) => /\.(svg|png|jpg|ico)$/.test(n))) {
      expect(usadas, `public/${f} no se usa en ningún archivo de src/`).toContain(f);
    }
    expect(existsSync(path.join(ROOT, "public/_headers"))).toBe(true);
  });
});

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// La pantalla /dev (plan 007, B1) no se anuncia ni se mezcla con las otras cuentas: sin enlaces desde ninguna parte, fuera de los
// buscadores y sin tocar los tokens de las comunidades ni de la nutricionista.
const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/[.](ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
};

const all = walk("src");
const isDevFile = (f: string) =>
  f.startsWith("src/app/dev/") || f.startsWith("src/components/dev/") || /src\/lib\/dev[A-Z]/.test(f) || f === "src/hooks/useDevProblems.ts" ||
  f === "src/types/dev.ts" || f === "src/app/dev.css" || f === "src/lib/errorExplanations.ts";
const devFiles = all.filter(isDevFile);
const otherFiles = all.filter((f) => !isDevFile(f));

describe("la pantalla /dev no se enlaza ni se anuncia", () => {
  it("existen sus archivos (la guarda no pasa en vacío)", () => {
    expect(devFiles.length).toBeGreaterThanOrEqual(12);
    expect(existsSync("src/app/dev/page.tsx")).toBe(true);
  });

  it("ningún otro archivo de la app la menciona como dirección (enlaces, redirecciones, rutas)", () => {
    const menciones = otherFiles.filter((f) => /["'`]\/dev(["'`/?#])/.test(readFileSync(f, "utf8")));
    expect(menciones).toEqual([]);
  });

  it("la página lleva noindex y nofollow", () => {
    const layout = readFileSync("src/app/dev/layout.tsx", "utf8");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
    expect(layout).toContain("Panel del desarrollador");
  });

  it("no hay robots.txt ni mapa del sitio que la listen", () => {
    for (const f of ["public/robots.txt", "public/sitemap.xml", "src/app/robots.ts", "src/app/sitemap.ts"]) {
      if (existsSync(f)) expect(readFileSync(f, "utf8"), f).not.toContain("/dev");
    }
  });
});

describe("la sesión del desarrollador no se mezcla con las otras", () => {
  it("los archivos de /dev nunca importan los tokens ni los servicios de las comunidades o de la nutricionista", () => {
    const prohibidos = ["@/lib/session", "@/lib/adminSession", "./session", "./adminSession", "authedRpc", "adminService", "kardexService", "marketService"];
    for (const f of devFiles) {
      const text = readFileSync(f, "utf8");
      for (const p of prohibidos) expect(text, `${f} importa ${p}`).not.toContain(`"${p}"`);
    }
  });

  it("y las otras cuentas nunca importan el token de /dev", () => {
    const usos = otherFiles.filter((f) => /devSession|devService/.test(readFileSync(f, "utf8")));
    expect(usos).toEqual([]);
  });

  it("el token solo se guarda en memoria: ni localStorage ni sessionStorage ni cookies", () => {
    for (const f of devFiles) {
      const text = readFileSync(f, "utf8");
      for (const almacen of ["localStorage", "sessionStorage", "document.cookie", "indexedDB"]) expect(text, `${f} usa ${almacen}`).not.toContain(almacen);
    }
  });

  it("la pantalla usa los tonos de texto de marca y el gris que cumplen el contraste (no el color de marca directo)", () => {
    const css = readFileSync("src/app/dev.css", "utf8");
    expect(css).not.toMatch(/(^|[^-a-zA-Z])color:\s*var\(--color-(accent-red|success|warning|primary-dark|primary-light)\)/m);
    expect(css).toContain("--color-accent-red-text");
  });
});

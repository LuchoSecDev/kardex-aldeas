import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sitio 100 % estático (plan 010): `next build` deja en `out/` solo archivos (HTML, JS y CSS), sin servidor.
  // Todo el "backend" es Supabase, al que el navegador llama directo. Así se puede publicar en un hosting
  // estático gratuito (Cloudflare Pages) y lo único que se paga es la base de datos.
  output: "export",


  // Solo aplica al servidor de desarrollo (`npm run dev`), no a producción.
  // Permite abrirlo desde otro dispositivo de la red local (por ejemplo un
  // celular en el mismo Wi-Fi: http://<IP-de-la-PC>:3000). Sin esto, Next
  // bloquea los recursos de desarrollo que no vienen de localhost.
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;

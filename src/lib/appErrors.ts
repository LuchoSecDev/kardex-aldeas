import { supabase } from "./supabase";
import { session } from "./session";
import { createErrorReporter } from "./errorReporter";

// Versión de la app que viaja en cada reporte para ligar los errores a un despliegue. Vercel entrega el hash del commit
// como NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA; en otro hosting (p. ej. Cloudflare Pages) hay que definir NEXT_PUBLIC_APP_VERSION
// en las variables del build. Sin ninguna, queda «local».
const RAW_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_VERSION || "local";
export const APP_VERSION = RAW_VERSION.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 12) || "local";

// El reportero de toda la app. Llama a la función directo con `supabase.rpc` (no por `authedRpc`) para no reportarse a sí mismo.
export const appErrors = createErrorReporter({
  version: APP_VERSION,
  getToken: () => session.get(),
  send: async (token, r) => {
    const { error } = await supabase.rpc("dev_report_client_error", {
      p_token: token,
      p_source: r.source,
      p_level: r.level,
      p_fn: r.fn,
      p_code: r.code ?? null,
      p_message: r.message,
      p_version: r.version,
    });
    return { error };
  },
});

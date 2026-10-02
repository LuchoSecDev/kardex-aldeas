import { supabase } from "./supabase";
import { session } from "./session";
import { appErrors } from "./appErrors";
import type { RpcResult } from "./kardexDataSource";

// Llama a una función de datos de Supabase adjuntando el token de sesión. La
// comunidad NO se envía: el servidor la deduce del token, así una sesión
// nunca puede tocar datos de otra comunidad.
export async function authedRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  // La sesión se toma una vez: si la llamada falla, el aviso de error se atribuye a ESTA sesión aunque ya haya entrado otra.
  const token = session.get();
  const { data, error } = await supabase.rpc(fn, { p_token: token, ...args });
  if (error?.message?.includes("SESION_INVALIDA")) session.notifyExpired();
  // Cualquier otro fallo se avisa al desarrollador (plan 007) sin esperar ni estorbar: nunca lleva los argumentos de la llamada.
  else if (error) void appErrors.reportRpcError(fn, error, token);
  return { data: data as T | null, error };
}

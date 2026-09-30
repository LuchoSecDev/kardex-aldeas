import { supabase } from "./supabase";
import { session } from "./session";
import type { RpcResult } from "./kardexDataSource";

// Llama a una función de datos de Supabase adjuntando el token de sesión. La
// comunidad NO se envía: el servidor la deduce del token, así una sesión
// nunca puede tocar datos de otra comunidad.
export async function authedRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  const { data, error } = await supabase.rpc(fn, { p_token: session.get(), ...args });
  if (error?.message?.includes("SESION_INVALIDA")) session.notifyExpired();
  return { data: data as T | null, error };
}

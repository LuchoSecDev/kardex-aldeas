import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { devSession } from "./devSession";
import type { RpcResult } from "./kardexDataSource";
import type {
  DevErrorGroup,
  DevErrorReport,
  DevErrorSummary,
  DevGroupKey,
  DevLoginResult,
  DevPasswordResult,
} from "@/types/dev";

// Llama a una función del desarrollador adjuntando su token de sesión (el de /dev, nunca el de una comunidad).
async function devRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  const { data, error } = await supabase.rpc(fn, { p_token: devSession.get(), ...args });
  if (error?.message?.includes("SESION_DEV_INVALIDA")) devSession.notifyExpired();
  return { data: data as T | null, error };
}

// Convierte el error del servidor en un mensaje para mostrar.
export function devErrorMessage(error: PostgrestError): string {
  const message = error.message ?? "";
  if (message.includes("DEV_BLOQUEADO")) return "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.";
  // Mensajes de validación pensados para mostrarse tal cual.
  if (message.startsWith("Contraseña inválida") || message.startsWith("La nueva contraseña")) return message;
  return "No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.";
}

const key = (g: DevGroupKey) => ({ p_community: g.community, p_fn: g.fn, p_source: g.source, p_level: g.level, p_code: g.code });

export const devService = {
  // El login NO lleva token: devuelve {token, must_change}, o null si la contraseña es incorrecta.
  async login(password: string) {
    const { data, error } = await supabase.rpc("dev_login", { p_password: password });
    return { data: data as DevLoginResult | null, error };
  },

  async changePassword(current: string, next: string) {
    return devRpc<DevPasswordResult>("dev_change_password", { p_current: current, p_new: next });
  },

  async logout() {
    const token = devSession.get();
    devSession.set(null);
    if (token) await supabase.rpc("dev_logout", { p_token: token });
  },

  async summary() {
    return devRpc<DevErrorSummary>("dev_error_summary");
  },

  async groups(days: number, onlyOpen: boolean) {
    return devRpc<DevErrorGroup[]>("dev_error_groups", { p_days: days, p_only_open: onlyOpen });
  },

  async detail(group: DevGroupKey, limit = 20) {
    return devRpc<DevErrorReport[]>("dev_error_group_detail", { ...key(group), p_limit: limit });
  },

  // Cierra los reportes abiertos del grupo; devuelve cuántos cerró.
  async resolve(group: DevGroupKey) {
    return devRpc<number>("dev_resolve_group", key(group));
  },
};

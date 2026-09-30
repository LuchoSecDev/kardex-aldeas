import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { adminSession } from "./adminSession";

type RpcResult<T> = { data: T | null; error: PostgrestError | null };

export type AdminLoginResult = { token: string; must_change: boolean };
export type PasswordResult = { ok: boolean; recovery_code: string | null };

// Llama a una función de administradora adjuntando su token de sesión.
async function adminRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  const { data, error } = await supabase.rpc(fn, { p_token: adminSession.get(), ...args });
  if (error?.message?.includes("SESION_ADMIN_INVALIDA")) adminSession.notifyExpired();
  return { data: data as T | null, error };
}

// Convierte el error del servidor en un mensaje para mostrar a la persona.
export function adminErrorMessage(error: PostgrestError): string {
  const message = error.message ?? "";
  if (message.includes("ADMIN_BLOQUEADO")) {
    return "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.";
  }
  // Mensajes de validación pensados para mostrarse tal cual.
  if (message.startsWith("Contraseña inválida") || message.startsWith("La nueva contraseña")) {
    return message;
  }
  return "No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.";
}

export const adminService = {
  async login(password: string): Promise<RpcResult<AdminLoginResult>> {
    const { data, error } = await supabase.rpc("admin_login", { p_password: password });
    return { data: (data as AdminLoginResult | null) ?? null, error };
  },

  async changePassword(current: string, next: string) {
    return adminRpc<PasswordResult>("admin_change_password", { p_current: current, p_new: next });
  },

  async recoverPassword(code: string, next: string): Promise<RpcResult<PasswordResult>> {
    const { data, error } = await supabase.rpc("admin_recover_password", { p_code: code, p_new: next });
    return { data: data as PasswordResult | null, error };
  },

  async logout() {
    const token = adminSession.get();
    adminSession.set(null);
    if (token) await supabase.rpc("admin_logout", { p_token: token });
  },
};

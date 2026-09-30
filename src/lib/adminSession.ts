// Token de sesión de la administradora (nutricionista). Es un módulo APARTE de
// lib/session.ts a propósito: el token de una comunidad nunca debe usarse en el
// panel ni al revés. Vive solo en memoria: al recargar la página se vuelve a
// pedir la contraseña.

let token: string | null = null;
const expiredListeners = new Set<() => void>();

export const adminSession = {
  get: () => token,

  set: (value: string | null) => {
    token = value;
  },

  // Se llama cuando el servidor responde SESION_ADMIN_INVALIDA (token vencido
  // o cerrado desde otro lugar).
  notifyExpired: () => {
    token = null;
    expiredListeners.forEach((listener) => listener());
  },

  onExpired: (listener: () => void) => {
    expiredListeners.add(listener);
    return () => {
      expiredListeners.delete(listener);
    };
  },
};

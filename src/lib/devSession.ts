// Token de sesión del desarrollador (pantalla /dev). Es un módulo APARTE de lib/session.ts y de lib/adminSession.ts a propósito:
// el token de una comunidad o de la nutricionista nunca debe usarse en /dev ni al revés. Vive solo en memoria: al recargar la
// página se vuelve a pedir la contraseña.

let token: string | null = null;
const expiredListeners = new Set<() => void>();

export const devSession = {
  get: () => token,

  set: (value: string | null) => {
    token = value;
  },

  // Se llama cuando el servidor responde SESION_DEV_INVALIDA (token vencido o cerrado desde otro lugar).
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

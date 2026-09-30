// Token de sesión de la comunidad activa. Vive solo en memoria (no en
// localStorage): al recargar la página se vuelve a pedir el PIN, igual que
// antes. Lo entrega login_community() y lo exigen todas las funciones de
// datos (ver supabase/session_access.sql).

let token: string | null = null;
const expiredListeners = new Set<() => void>();

export const session = {
  get: () => token,

  set: (value: string | null) => {
    token = value;
  },

  // Se llama cuando el servidor responde SESION_INVALIDA (token vencido o
  // desconocido). Borra el token y avisa a quien esté escuchando.
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

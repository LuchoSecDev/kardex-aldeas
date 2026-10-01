// Reglas del PIN de la comunidad (4 dígitos). Las de «PIN débil» son las mismas que aplica el servidor
// en supabase/change_pin.sql (_pin_is_weak): aquí solo se adelantan para avisar sin esperar la respuesta.

export const PIN_LENGTH = 4;

export const onlyPinDigits = (value: string) => value.replace(/\D/g, "").slice(0, PIN_LENGTH);

// 4 dígitos iguales (0000) o una secuencia seguida hacia arriba o hacia abajo (1234, 4321): 24 PIN en total.
export function isWeakPin(pin: string): boolean {
  return /^(\d)\1{3}$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin);
}

export function validatePinChange(current: string, next: string, confirm: string): string | null {
  if (current.length !== PIN_LENGTH) return "Escribe tu PIN actual (4 dígitos).";
  if (next.length !== PIN_LENGTH) return "El PIN nuevo debe tener 4 dígitos.";
  if (next === current) return "El PIN nuevo debe ser distinto del actual.";
  if (isWeakPin(next)) return "Ese PIN es muy fácil de adivinar (como 0000 o 1234). Elige otro.";
  if (next !== confirm) return "Los dos PIN nuevos no coinciden.";
  return null;
}

export const WRONG_CURRENT_PIN_MESSAGE = "El PIN actual no es correcto.";

// Mensaje para el error que devuelve change_community_pin (el PIN actual equivocado NO es un error: la función
// devuelve false, ver WRONG_CURRENT_PIN_MESSAGE).
export function pinChangeErrorMessage(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("PIN_BLOQUEADO")) return "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.";
  if (message.includes("PIN_DEBIL")) return "Ese PIN es muy fácil de adivinar (como 0000 o 1234). Elige otro.";
  if (message.includes("PIN_IGUAL")) return "El PIN nuevo debe ser distinto del actual.";
  return "No se pudo cambiar el PIN. Revisa tu conexión e inténtalo de nuevo.";
}

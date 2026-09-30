import { createClient } from "@supabase/supabase-js";
import { expect } from "vitest";

// Cliente anónimo, exactamente como el de la app: las pruebas solo pueden
// hacer lo que haría cualquiera con la anon key pública.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);

// REGLA: estas pruebas escriben SOLO en comunidades ZZZ_TEST_BORRAR_AUTO_*.
// Nunca se prueban PINs incorrectos contra comunidades reales: bloquearían a
// quien las usa. Los datos de prueba se borran con supabase/cleanup_test_data.sql.
export const TEST_PIN = "4321";

export const uniqueName = (tag: string) =>
  `ZZZ_TEST_BORRAR_AUTO_${tag}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

export const zeros = (n: number) => Array(n).fill(0);

export async function createTestCommunity(tag: string) {
  const name = uniqueName(tag);
  const created = await supabase.rpc("create_community_with_pin", { p_name: name, p_pin: TEST_PIN });
  expect(created.error).toBeNull();
  expect(created.data).toBe(true);

  const login = await supabase.rpc("login_community", { p_name: name, p_pin: TEST_PIN });
  expect(login.error).toBeNull();
  expect(typeof login.data).toBe("string");

  return { name, token: login.data as string };
}

// Un producto real del catálogo (las funciones de guardado validan que exista).
export async function anyProductId(): Promise<string> {
  const { data, error } = await supabase.from("products").select("id").eq("is_active", true).limit(1);
  expect(error).toBeNull();
  expect(data?.length).toBeGreaterThan(0);
  return data![0].id as string;
}

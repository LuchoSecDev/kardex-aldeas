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

// Crear una comunidad ya no es libre (plan 005): exige la clave de aprovisionamiento
// (PROVISION_KEY en .env.local, la misma que se guardó con lock_down_community_creation_1.sql).
export function provisionKey(): string {
  const key = process.env.PROVISION_KEY;
  if (!key) {
    throw new Error(
      "PROVISION_KEY está vacía o no existe en .env.local: las pruebas necesitan la clave para crear comunidades ZZZ_TEST_ (ver planes/005). " +
        'Si la clave lleva un # (o un $), escríbela ENTRE COMILLAS DOBLES: PROVISION_KEY="tu-clave"; sin comillas el # corta el valor.'
    );
  }
  return key;
}

export const provision = (name: string, pin: string, key: string = provisionKey()) =>
  supabase.rpc("provision_community", { p_key: key, p_name: name, p_pin: pin });

export async function createTestCommunity(tag: string) {
  const name = uniqueName(tag);
  const created = await provision(name, TEST_PIN);
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

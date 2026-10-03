import { normalizeText } from "@/lib/marketList";

// Buscador del kardex: deja los productos cuyo nombre contiene lo escrito, sin importar mayúsculas ni tildes («lacteos» encuentra
// «LÁCTEOS»); es la misma regla del buscador de la lista de mercado. Vacío o solo espacios = no filtra.
export function filterProductsByName<T extends { name: string }>(products: T[], query: string): T[] {
  const q = normalizeText(query);
  if (!q) return products;
  return products.filter((product) => normalizeText(product.name).includes(q));
}

// Mensaje cuando la búsqueda no encuentra nada; si además hay una categoría elegida, sugiere quitarla.
export function noProductsMessage(query: string, category: string): string {
  const q = query.trim();
  if (category === "TODAS") return `Ningún producto coincide con «${q}».`;
  return `Ningún producto de la categoría ${category} coincide con «${q}». Prueba con «Todas las categorías».`;
}

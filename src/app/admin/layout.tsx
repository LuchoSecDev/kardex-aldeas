import type { Metadata } from "next";

// El panel no debe aparecer en buscadores.
export const metadata: Metadata = {
  title: "Panel administrativo - Kardex Digital",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}

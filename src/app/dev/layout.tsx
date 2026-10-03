import type { Metadata } from "next";

// La pantalla del desarrollador no debe aparecer en buscadores ni enlazarse desde ninguna otra pantalla.
export const metadata: Metadata = {
  title: "Panel del desarrollador - Kardex Digital",
  robots: { index: false, follow: false },
};

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return children;
}

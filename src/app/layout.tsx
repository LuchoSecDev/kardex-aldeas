import type { Metadata, Viewport } from "next";
import "./globals.css";
import { A11yProvider } from "@/components/A11yProvider";
import NumberWheelGuard from "@/components/NumberWheelGuard";
import { ToastProvider } from "@/components/toast/ToastProvider";

export const metadata: Metadata = {
  title: "Kardex Digital - Aldeas Infantiles SOS",
  description: "Sistema de registro de movimiento diario de alimentos",
};

// maximumScale: 5 permite hacer zoom (accesibilidad visual), Next ya no
// duplica su propio <meta viewport> por defecto cuando se declara aquí.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <A11yProvider>
          <NumberWheelGuard />
          <ToastProvider>{children}</ToastProvider>
        </A11yProvider>
      </body>
    </html>
  );
}

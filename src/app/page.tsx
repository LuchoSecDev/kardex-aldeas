"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CommunityShell from "@/components/CommunityShell";
import CommunityCombobox from "@/components/CommunityCombobox";
import PinGate, { PinGateMode } from "@/components/PinGate";
import { kardexService } from "@/lib/kardexService";
import { session } from "@/lib/session";

type CommunityInfo = { name: string; has_pin: boolean };

export default function Home() {
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const [tempSelection, setTempSelection] = useState("");
  const [communities, setCommunities] = useState<CommunityInfo[]>([]);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(true);

  // Paso de PIN: null mientras se elige la comunidad; se activa al enviar
  // el formulario, en el modo que corresponda según si la comunidad existe
  // y si ya tiene PIN.
  const [pinMode, setPinMode] = useState<PinGateMode | null>(null);
  const [pinCommunity, setPinCommunity] = useState("");
  const [isSubmittingPin, setIsSubmittingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  useEffect(() => {
    const loadCommunities = async () => {
      const { data, error } = await kardexService.loadCommunities();
      if (error) {
        console.error("Error cargando comunidades:", error);
      } else if (data) {
        setCommunities(data as CommunityInfo[]);
      }
      setIsLoadingCommunities(false);
    };
    loadCommunities();
  }, []);

  // Si el servidor rechaza el token (sesión vencida), se vuelve a la pantalla
  // de entrada con un aviso en vez de fallar en silencio al guardar.
  useEffect(() => {
    return session.onExpired(() => {
      setSelectedCommunity(null);
      setPinMode(null);
      setTempSelection("");
      setSessionNotice("Tu sesión venció. Vuelve a entrar con el PIN de tu comunidad.");
    });
  }, []);

  const handleEnter = (e: React.FormEvent) => {
    e.preventDefault();
    const typed = tempSelection.trim();
    if (!typed) return;

    // Si ya existe con otra combinación de mayúsculas/minúsculas, usamos el
    // nombre ya guardado para no crear una comunidad duplicada.
    const existing = communities.find((c) => c.name.toLowerCase() === typed.toLowerCase());
    const finalName = existing?.name ?? typed;

    setPinCommunity(finalName);
    setPinError(null);
    setPinMode(!existing ? "create" : existing.has_pin ? "verify" : "claim");
  };

  // Pide el token de sesión al servidor y, si lo obtiene, entra al kardex.
  // Devuelve false (con el mensaje ya mostrado) si no se pudo entrar.
  const enterWithSession = async (pin?: string): Promise<boolean> => {
    const { data: token, error } = await kardexService.loginCommunity(pinCommunity, pin);
    if (error) {
      console.error("Error iniciando sesión:", error);
      setPinError(
        error.message?.includes("PIN_BLOQUEADO")
          ? "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo."
          : "No se pudo verificar el PIN. Intenta de nuevo."
      );
      return false;
    }
    if (!token) {
      setPinError("PIN incorrecto.");
      return false;
    }
    session.set(token);
    setSessionNotice(null);
    setSelectedCommunity(pinCommunity);
    return true;
  };

  const handleSubmitPin = async (pin: string) => {
    setIsSubmittingPin(true);
    setPinError(null);

    if (pinMode === "create") {
      const { data, error } = await kardexService.createCommunityWithPin(pinCommunity, pin);
      if (error || !data) {
        console.error("Error creando la comunidad:", error);
        setIsSubmittingPin(false);
        setPinError("No se pudo crear la comunidad. Intenta de nuevo.");
        return;
      }
      // Actualiza la lista en memoria: si no, al salir y volver a entrar a
      // esta misma comunidad se trataría otra vez como si fuera nueva.
      setCommunities((prev) => [...prev, { name: pinCommunity, has_pin: true }]);
    } else if (pinMode === "claim") {
      const { data, error } = await kardexService.claimPinForExistingCommunity(pinCommunity, pin);
      if (error || !data) {
        console.error("Error asignando el PIN:", error);
        setIsSubmittingPin(false);
        setPinError("No se pudo asignar el PIN. Intenta de nuevo.");
        return;
      }
      setCommunities((prev) => prev.map((c) => c.name === pinCommunity ? { ...c, has_pin: true } : c));
    }

    const entered = await enterWithSession(pin);
    setIsSubmittingPin(false);
    // La comunidad/PIN ya quedaron creados: si el inicio de sesión falla, un
    // reintento debe pasar por la verificación normal, no volver a crear.
    if (!entered && pinMode !== "verify") setPinMode("verify");
  };

  const handleSkipClaim = async () => {
    setIsSubmittingPin(true);
    setPinError(null);
    const entered = await enterWithSession();
    setIsSubmittingPin(false);
    // Si mientras tanto alguien le puso PIN a la comunidad, ya no se puede
    // entrar sin él: se pasa a pedirlo.
    if (!entered) {
      setCommunities((prev) => prev.map((c) => c.name === pinCommunity ? { ...c, has_pin: true } : c));
      setPinMode("verify");
      setPinError("Esta comunidad ya tiene PIN. Ingrésalo para entrar.");
    }
  };

  const handleCancelPin = () => {
    setPinMode(null);
    setPinCommunity("");
    setPinError(null);
    setTempSelection("");
  };

  const handleLogout = () => {
    kardexService.logoutCommunity();
    setSelectedCommunity(null);
    setPinMode(null);
  };

  if (selectedCommunity) {
    return <CommunityShell community={selectedCommunity} onLogout={handleLogout} />;
  }

  return (
    <div style={{
      minHeight: "calc(100vh - 40px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "var(--spacing-base)",
    }}>
      {pinMode ? (
        <PinGate
          community={pinCommunity}
          mode={pinMode}
          isSubmitting={isSubmittingPin}
          serverError={pinError}
          onSubmitPin={handleSubmitPin}
          onSkipClaim={handleSkipClaim}
          onCancel={handleCancelPin}
        />
      ) : (
        <div className="card" style={{ maxWidth: "500px", width: "100%", textAlign: "center" }}>

          <h1 style={{ color: "var(--color-primary-light)", fontSize: "2rem", marginBottom: "2rem" }}>
            <span style={{color: "var(--color-primary-dark)"}}>Aldeas Infantiles SOS</span><br/>
            Kardex Digital
          </h1>

          <p style={{ marginBottom: "2rem", fontSize: "1.2rem" }}>
            Bienvenido. Escriba el nombre de su comunidad (o selecciónela si ya existe) para comenzar el registro diario de alimentos.
          </p>

          {sessionNotice && (
            <p role="alert" style={{ marginBottom: "1.5rem", color: "var(--color-accent-red)", fontWeight: 600 }}>
              {sessionNotice}
            </p>
          )}

          <form onSubmit={handleEnter} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{ textAlign: "left" }}>
              <label htmlFor="community" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
                Comunidad
              </label>
              <CommunityCombobox
                value={tempSelection}
                onChange={setTempSelection}
                suggestions={communities.map((c) => c.name)}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ fontSize: "1.25rem", padding: "1rem", marginTop: "1rem" }}
              disabled={!tempSelection.trim() || isLoadingCommunities}
            >
              {isLoadingCommunities ? "Cargando comunidades..." : "Continuar"}
            </button>
          </form>

          {/* Acceso de la nutricionista: discreto y aparte del formulario de las
              comunidades (ver planes/001). */}
          <div style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border)" }}>
            <Link
              href="/admin"
              style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", textDecoration: "underline" }}
            >
              Acceso administrativo
            </Link>
          </div>

        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CommunityShell from "@/components/CommunityShell";
import CustomSelect from "@/components/CustomSelect";
import PinGate from "@/components/PinGate";
import { kardexService } from "@/lib/kardexService";
import { session } from "@/lib/session";

type CommunityInfo = { name: string; has_pin: boolean };

export default function Home() {
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const [tempSelection, setTempSelection] = useState("");
  const [communities, setCommunities] = useState<CommunityInfo[]>([]);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Paso del PIN: null mientras se elige la comunidad. Las comunidades son fijas
  // (las crea la administración con su PIN, ver planes/005): aquí solo se elige una.
  const [pinCommunity, setPinCommunity] = useState<string | null>(null);
  const [isSubmittingPin, setIsSubmittingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    const loadCommunities = async () => {
      const { data, error } = await kardexService.loadCommunities();
      if (error || !data) {
        console.error("Error cargando comunidades:", error);
        setLoadFailed(true);
      } else {
        setCommunities(data as CommunityInfo[]);
        setLoadFailed(false);
      }
      setIsLoadingCommunities(false);
    };
    loadCommunities();
  }, [loadAttempt]);

  const retryLoad = () => {
    setIsLoadingCommunities(true);
    setLoadAttempt((n) => n + 1);
  };

  // Si el servidor rechaza el token (sesión vencida), se vuelve a la pantalla
  // de entrada con un aviso en vez de fallar en silencio al guardar.
  useEffect(() => {
    return session.onExpired(() => {
      setSelectedCommunity(null);
      setPinCommunity(null);
      setTempSelection("");
      setSessionNotice("Tu sesión venció. Vuelve a entrar con el PIN de tu comunidad.");
    });
  }, []);

  const handleEnter = (e: React.FormEvent) => {
    e.preventDefault();
    const community = communities.find((c) => c.name === tempSelection);
    if (!community) return;

    // Una comunidad sin PIN no puede entrar (tampoco lo permite el servidor).
    if (!community.has_pin) {
      setSelectionError("Esta comunidad todavía no tiene PIN. Pídele a la administradora que se lo asigne.");
      return;
    }

    setSelectionError(null);
    setPinError(null);
    setPinCommunity(community.name);
  };

  // Pide el token de sesión al servidor y, si lo obtiene, entra al kardex.
  const handleSubmitPin = async (pin: string) => {
    if (!pinCommunity) return;
    setIsSubmittingPin(true);
    setPinError(null);

    const { data: token, error } = await kardexService.loginCommunity(pinCommunity, pin);
    setIsSubmittingPin(false);

    if (error) {
      console.error("Error iniciando sesión:", error);
      setPinError(
        error.message?.includes("PIN_BLOQUEADO")
          ? "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo."
          : "No se pudo verificar el PIN. Intenta de nuevo."
      );
      return;
    }
    if (!token) {
      setPinError("PIN incorrecto.");
      return;
    }
    session.set(token);
    setSessionNotice(null);
    setSelectedCommunity(pinCommunity);
  };

  const handleCancelPin = () => {
    setPinCommunity(null);
    setPinError(null);
    setTempSelection("");
  };

  const handleLogout = () => {
    kardexService.logoutCommunity();
    setSelectedCommunity(null);
    setPinCommunity(null);
    setTempSelection("");
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
      {pinCommunity ? (
        <PinGate
          community={pinCommunity}
          isSubmitting={isSubmittingPin}
          serverError={pinError}
          onSubmitPin={handleSubmitPin}
          onCancel={handleCancelPin}
        />
      ) : (
        <div className="card" style={{ maxWidth: "500px", width: "100%", textAlign: "center" }}>

          <h1 style={{ color: "var(--color-primary-light)", fontSize: "2rem", marginBottom: "2rem" }}>
            <span style={{color: "var(--color-primary-dark)"}}>Aldeas Infantiles SOS</span><br/>
            Kardex Digital
          </h1>

          <p style={{ marginBottom: "2rem", fontSize: "1.2rem" }}>
            Bienvenido. Seleccione su comunidad para comenzar el registro diario de alimentos.
          </p>

          {sessionNotice && (
            <p role="alert" style={{ marginBottom: "1.5rem", color: "var(--color-accent-red)", fontWeight: 600 }}>
              {sessionNotice}
            </p>
          )}

          {loadFailed ? (
            <div role="alert" style={{ marginBottom: "1rem" }}>
              <p style={{ color: "var(--color-accent-red)", fontWeight: 600, marginBottom: "1rem" }}>
                No se pudo cargar la lista de comunidades. Revisa tu conexión a internet.
              </p>
              <button type="button" className="btn btn-primary" onClick={retryLoad} disabled={isLoadingCommunities}>
                {isLoadingCommunities ? "Cargando..." : "Reintentar"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleEnter} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ textAlign: "left" }}>
                <label htmlFor="community" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
                  Comunidad
                </label>
                <CustomSelect
                  className="home-select"
                  options={communities.map((c) => ({ value: c.name, label: c.name }))}
                  value={tempSelection}
                  onChange={(value) => {
                    setTempSelection(value);
                    setSelectionError(null);
                  }}
                  placeholder={isLoadingCommunities ? "Cargando comunidades..." : "Elija su comunidad"}
                />
              </div>

              {selectionError && (
                <p role="alert" style={{ color: "var(--color-accent-red)", fontWeight: 600, margin: 0 }}>
                  {selectionError}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                style={{ fontSize: "1.25rem", padding: "1rem", marginTop: "1rem" }}
                disabled={!tempSelection || isLoadingCommunities}
              >
                {isLoadingCommunities ? "Cargando comunidades..." : "Continuar"}
              </button>
            </form>
          )}

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

"use client";

import { useEffect, useState } from "react";
import KardexDashboard from "@/components/KardexDashboard";
import CommunityCombobox from "@/components/CommunityCombobox";
import PinGate, { PinGateMode } from "@/components/PinGate";
import { kardexService } from "@/lib/kardexService";

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

  const handleSubmitPin = async (pin: string) => {
    setIsSubmittingPin(true);
    setPinError(null);

    if (pinMode === "verify") {
      const { data, error } = await kardexService.verifyCommunityPin(pinCommunity, pin);
      setIsSubmittingPin(false);
      if (error) {
        console.error("Error verificando el PIN:", error);
        setPinError("No se pudo verificar el PIN. Intenta de nuevo.");
        return;
      }
      if (!data) {
        setPinError("PIN incorrecto.");
        return;
      }
      setSelectedCommunity(pinCommunity);
      return;
    }

    if (pinMode === "create") {
      const { data, error } = await kardexService.createCommunityWithPin(pinCommunity, pin);
      setIsSubmittingPin(false);
      if (error || !data) {
        console.error("Error creando la comunidad:", error);
        setPinError("No se pudo crear la comunidad. Intenta de nuevo.");
        return;
      }
      // Actualiza la lista en memoria: si no, al salir y volver a entrar a
      // esta misma comunidad se trataría otra vez como si fuera nueva.
      setCommunities((prev) => [...prev, { name: pinCommunity, has_pin: true }]);
      setSelectedCommunity(pinCommunity);
      return;
    }

    if (pinMode === "claim") {
      const { data, error } = await kardexService.claimPinForExistingCommunity(pinCommunity, pin);
      setIsSubmittingPin(false);
      if (error || !data) {
        console.error("Error asignando el PIN:", error);
        setPinError("No se pudo asignar el PIN. Intenta de nuevo.");
        return;
      }
      setCommunities((prev) => prev.map((c) => c.name === pinCommunity ? { ...c, has_pin: true } : c));
      setSelectedCommunity(pinCommunity);
      return;
    }
  };

  const handleSkipClaim = () => {
    setSelectedCommunity(pinCommunity);
  };

  const handleCancelPin = () => {
    setPinMode(null);
    setPinCommunity("");
    setPinError(null);
    setTempSelection("");
  };

  const handleLogout = () => {
    setSelectedCommunity(null);
    setPinMode(null);
  };

  if (selectedCommunity) {
    return <KardexDashboard community={selectedCommunity} onLogout={handleLogout} />;
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

        </div>
      )}
    </div>
  );
}

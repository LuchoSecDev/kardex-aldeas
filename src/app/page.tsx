"use client";

import { useEffect, useState } from "react";
import KardexDashboard from "@/components/KardexDashboard";
import CommunityCombobox from "@/components/CommunityCombobox";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const [tempSelection, setTempSelection] = useState("");
  const [communities, setCommunities] = useState<string[]>([]);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadCommunities = async () => {
      const { data, error } = await supabase
        .from("communities")
        .select("name")
        .order("name");

      if (error) {
        console.error("Error cargando comunidades:", error);
      } else if (data) {
        setCommunities(data.map((row) => row.name as string));
      }
      setIsLoadingCommunities(false);
    };
    loadCommunities();
  }, []);

  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault();
    const typed = tempSelection.trim();
    if (!typed) return;

    // Si ya existe con otra combinación de mayúsculas/minúsculas, usamos el nombre
    // ya guardado para no crear una comunidad duplicada.
    const existing = communities.find((c) => c.toLowerCase() === typed.toLowerCase());
    const finalName = existing ?? typed;

    if (!existing) {
      setIsSaving(true);
      const { error } = await supabase
        .from("communities")
        .upsert({ name: finalName }, { onConflict: "name" });
      setIsSaving(false);
      if (error) {
        console.error("Error guardando la comunidad:", error);
      }
    }

    setSelectedCommunity(finalName);
  };

  if (selectedCommunity) {
    return <KardexDashboard community={selectedCommunity} onLogout={() => setSelectedCommunity(null)} />;
  }

  return (
    <div style={{
      minHeight: "calc(100vh - 40px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "var(--spacing-base)",
    }}>
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
              suggestions={communities}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ fontSize: "1.25rem", padding: "1rem", marginTop: "1rem" }}
            disabled={!tempSelection.trim() || isSaving || isLoadingCommunities}
          >
            {isSaving ? "Guardando comunidad..." : isLoadingCommunities ? "Cargando comunidades..." : "Ingresar al Kardex"}
          </button>
        </form>

      </div>
    </div>
  );
}

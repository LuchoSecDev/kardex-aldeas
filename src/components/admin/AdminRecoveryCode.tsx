"use client";

import { useState } from "react";

// Muestra el código de recuperación UNA sola vez. Hay que confirmar que se
// guardó antes de continuar: si se pierde junto con la contraseña, solo se
// puede resetear por SQL.
export default function AdminRecoveryCode({
  code,
  context,
  onContinue,
}: {
  code: string;
  context: "first" | "recovered";
  onContinue: () => void;
}) {
  const [saved, setSaved] = useState(false);

  return (
    <div className="card admin-card">
      <h1 className="admin-title">Guarda tu código de recuperación</h1>
      <p className="admin-lead">
        {context === "first"
          ? "Contraseña creada. Si algún día la olvidas, este código te permite crear otra."
          : "Contraseña restablecida. Este es tu NUEVO código de recuperación; el anterior ya no sirve."}
      </p>

      <p className="admin-code" aria-label="Código de recuperación">{code}</p>

      <p className="admin-hint" style={{ marginBottom: "1rem" }}>
        Se muestra solo esta vez. Cópialo y guárdalo en un lugar seguro (no lo compartas por chat).
        Sirve una sola vez: al usarlo se genera uno nuevo.
      </p>

      <div className="admin-form">
        <label className="admin-check">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          Ya guardé el código en un lugar seguro
        </label>

        <button type="button" className="btn btn-primary" onClick={onContinue} disabled={!saved}>
          {context === "first" ? "Continuar" : "Ir a iniciar sesión"}
        </button>
      </div>
    </div>
  );
}

"use client";

import ConfirmDialog from "@/components/ConfirmDialog";

// Aviso de que otra persona cambió datos mientras esta escribía (plan 012): el guardado se rechazó para no pisar lo de la otra
// persona y la pantalla ya cargó lo último. Lo escrito encima de esa vista vieja no se aplicó y hay que volver a escribirlo.
export default function ConflictDialog({ productNames, onClose }: { productNames: string[]; onClose: () => void }) {
  const list = productNames.length === 1 ? productNames[0] : `${productNames.slice(0, -1).join(", ")} y ${productNames[productNames.length - 1]}`;
  return (
    <ConfirmDialog title="Otra persona cambió estos datos" confirmLabel="Entendido" cancelLabel={null} onConfirm={onClose} onCancel={onClose}>
      <p>
        Mientras escribías, otra persona cambió <strong>{list}</strong>. Para no borrar lo suyo, tu cambio <strong>no se guardó</strong>.
      </p>
      <p>Ya cargamos lo último. Revisa los datos y vuelve a escribir tu cambio.</p>
    </ConfirmDialog>
  );
}

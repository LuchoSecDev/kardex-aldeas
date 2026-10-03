"use client";

import ConfirmDialog from "@/components/ConfirmDialog";

// Aviso al cambiar de comunidad (o salir) cuando todavía hay cambios sin guardar: lo usan el kardex y la lista de mercado.
// El foco empieza en «Seguir aquí» para que un toque o un Enter sin querer no haga perder lo escrito.
export default function UnsavedChangesDialog({ onLeave, onStay }: { onLeave: () => void; onStay: () => void }) {
  return (
    <ConfirmDialog title="Hay cambios sin guardar" confirmLabel="Salir de todos modos" cancelLabel="Seguir aquí" danger onConfirm={onLeave} onCancel={onStay}>
      <p>Todavía hay cambios que no se han guardado. Si sales ahora se perderán.</p>
    </ConfirmDialog>
  );
}

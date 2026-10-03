"use client";

import "@/app/admin.css";
import "@/app/dev.css";
import { useEffect, useState } from "react";
import DevLogin from "@/components/dev/DevLogin";
import DevPanel from "@/components/dev/DevPanel";
import DevPasswordForm from "@/components/dev/DevPasswordForm";
import { devErrorMessage, devService } from "@/lib/devService";
import { devSession } from "@/lib/devSession";

type Screen = "login" | "forced-change" | "change" | "panel";

export default function DevPage() {
  const [screen, setScreen] = useState<Screen>("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Contraseña temporal escrita al entrar: se conserva solo en memoria mientras dura el cambio obligatorio (el servidor la pide como
  // «contraseña actual»).
  const [tempPassword, setTempPassword] = useState("");

  // Esta pantalla es solo para el desarrollador: no necesita la barra de accesibilidad visual (dev.css la oculta mientras esta clase
  // esté en el body; se quita al salir para no afectar a las otras pantallas).
  useEffect(() => {
    document.body.classList.add("dev-screen");
    return () => document.body.classList.remove("dev-screen");
  }, []);

  // Sesión vencida o cerrada desde otro lugar: volver al inicio con un aviso.
  useEffect(() => {
    return devSession.onExpired(() => {
      setTempPassword("");
      setError(null);
      setNotice("Tu sesión venció. Vuelve a entrar con tu contraseña.");
      setScreen("login");
    });
  }, []);

  const goTo = (next: Screen) => {
    setError(null);
    setScreen(next);
  };

  const handleLogin = async (password: string) => {
    setIsSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await devService.login(password);
    setIsSubmitting(false);

    if (rpcError) {
      console.error("Error de acceso del desarrollador:", rpcError);
      setError(devErrorMessage(rpcError));
      return;
    }
    // Contraseña incorrecta y cuenta inexistente se ven igual a propósito.
    if (!data) {
      setError("Contraseña incorrecta.");
      return;
    }

    devSession.set(data.token);
    setNotice(null);
    if (data.must_change) {
      setTempPassword(password);
      goTo("forced-change");
    } else {
      goTo("panel");
    }
  };

  const handleChangePassword = async (current: string, next: string) => {
    setIsSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await devService.changePassword(current, next);
    setIsSubmitting(false);

    if (rpcError) {
      // Si la sesión venció, el listener ya movió la pantalla a «login».
      if (!rpcError.message?.includes("SESION_DEV_INVALIDA")) {
        console.error("Error cambiando la contraseña del desarrollador:", rpcError);
        setError(devErrorMessage(rpcError));
      }
      return;
    }
    if (!data?.ok) {
      setError("La contraseña actual no es correcta.");
      return;
    }

    setTempPassword("");
    setNotice("Contraseña actualizada.");
    goTo("panel");
  };

  const handleLogout = async () => {
    await devService.logout();
    setNotice(null);
    goTo("login");
  };

  // El panel usa todo el ancho (no la tarjeta centrada de las demás pantallas).
  if (screen === "panel") {
    return (
      <DevPanel
        notice={notice}
        onChangePassword={() => {
          setNotice(null);
          goTo("change");
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="admin-page">
      {screen === "login" && <DevLogin isSubmitting={isSubmitting} error={error} notice={notice} onSubmit={handleLogin} />}

      {screen === "forced-change" && (
        <DevPasswordForm
          mode="forced"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={(_current, next) => handleChangePassword(tempPassword, next)}
        />
      )}

      {screen === "change" && (
        <DevPasswordForm mode="voluntary" isSubmitting={isSubmitting} serverError={error} onSubmit={handleChangePassword} onCancel={() => goTo("panel")} />
      )}
    </div>
  );
}

"use client";

import "@/app/admin.css";
import { useEffect, useState } from "react";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminPasswordForm from "@/components/admin/AdminPasswordForm";
import AdminRecoveryCode from "@/components/admin/AdminRecoveryCode";
import AdminRecover from "@/components/admin/AdminRecover";
import { adminService, adminErrorMessage } from "@/lib/adminService";
import { adminSession } from "@/lib/adminSession";

type Screen = "login" | "forced-change" | "recovery-code" | "recover" | "change" | "panel";

export default function AdminPage() {
  const [screen, setScreen] = useState<Screen>("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Contraseña temporal escrita al entrar: se conserva solo en memoria mientras
  // dura el cambio obligatorio (el servidor la pide como "contraseña actual").
  const [tempPassword, setTempPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [afterCode, setAfterCode] = useState<"panel" | "login">("panel");

  // Sesión vencida o cerrada desde otro lugar: volver al inicio con un aviso.
  useEffect(() => {
    return adminSession.onExpired(() => {
      setTempPassword("");
      setRecoveryCode(null);
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
    const { data, error: rpcError } = await adminService.login(password);
    setIsSubmitting(false);

    if (rpcError) {
      console.error("Error de acceso de administradora:", rpcError);
      setError(adminErrorMessage(rpcError));
      return;
    }
    if (!data) {
      setError("Contraseña incorrecta.");
      return;
    }

    adminSession.set(data.token);
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
    const { data, error: rpcError } = await adminService.changePassword(current, next);
    setIsSubmitting(false);

    if (rpcError) {
      // Si la sesión venció, el listener ya movió la pantalla a "login".
      if (!rpcError.message?.includes("SESION_ADMIN_INVALIDA")) {
        console.error("Error cambiando la contraseña:", rpcError);
        setError(adminErrorMessage(rpcError));
      }
      return;
    }
    if (!data?.ok) {
      setError("La contraseña actual no es correcta.");
      return;
    }

    setTempPassword("");
    if (data.recovery_code) {
      setRecoveryCode(data.recovery_code);
      setAfterCode("panel");
      goTo("recovery-code");
    } else {
      setNotice("Contraseña actualizada.");
      goTo("panel");
    }
  };

  const handleRecover = async (code: string, next: string) => {
    setIsSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await adminService.recoverPassword(code, next);
    setIsSubmitting(false);

    if (rpcError) {
      console.error("Error recuperando la contraseña:", rpcError);
      setError(adminErrorMessage(rpcError));
      return;
    }
    if (!data?.ok || !data.recovery_code) {
      setError("El código de recuperación no es correcto.");
      return;
    }

    setRecoveryCode(data.recovery_code);
    setAfterCode("login");
    goTo("recovery-code");
  };

  const handleCodeAcknowledged = () => {
    setRecoveryCode(null);
    if (afterCode === "login") {
      setNotice("Contraseña restablecida. Entra con la nueva.");
      goTo("login");
    } else {
      goTo("panel");
    }
  };

  const handleLogout = async () => {
    await adminService.logout();
    setNotice(null);
    goTo("login");
  };

  return (
    <div className="admin-page">
      {screen === "login" && (
        <AdminLogin
          isSubmitting={isSubmitting}
          error={error}
          notice={notice}
          onSubmit={handleLogin}
          onForgot={() => goTo("recover")}
        />
      )}

      {screen === "forced-change" && (
        <AdminPasswordForm
          mode="forced"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={(_current, next) => handleChangePassword(tempPassword, next)}
        />
      )}

      {screen === "recovery-code" && recoveryCode && (
        <AdminRecoveryCode
          code={recoveryCode}
          context={afterCode === "login" ? "recovered" : "first"}
          onContinue={handleCodeAcknowledged}
        />
      )}

      {screen === "recover" && (
        <AdminRecover
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={handleRecover}
          onCancel={() => goTo("login")}
        />
      )}

      {screen === "change" && (
        <AdminPasswordForm
          mode="voluntary"
          isSubmitting={isSubmitting}
          serverError={error}
          onSubmit={handleChangePassword}
          onCancel={() => goTo("panel")}
        />
      )}

      {screen === "panel" && (
        <div className="card admin-card">
          <h1 className="admin-title">Panel de la nutricionista</h1>
          {notice && <p role="status" className="admin-notice">{notice}</p>}
          <p className="admin-lead">
            Sesión iniciada. Las herramientas de consulta (comunidades, Excel y campanita) llegan en las siguientes fases.
          </p>
          <div className="admin-actions">
            <button type="button" className="btn btn-outline" onClick={() => { setNotice(null); goTo("change"); }}>
              Cambiar contraseña
            </button>
            <button type="button" className="btn btn-primary" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

export default function ErrorToast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        bottom: "1.5rem",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "var(--color-accent-red)",
        color: "white",
        padding: "0.9rem 1.5rem",
        borderRadius: "10px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
        zIndex: 2000,
        maxWidth: "90vw",
        fontWeight: 600,
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}

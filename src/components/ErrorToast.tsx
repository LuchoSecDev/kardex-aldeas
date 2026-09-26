"use client";

export default function ErrorToast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div role="alert" className="kardex-toast">
      {message}
    </div>
  );
}

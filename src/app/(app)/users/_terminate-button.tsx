"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function TerminateButton({ userId }: { userId: number }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleTerminate() {
    if (!confirm("Terminate all sessions for this user?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/revoke-session`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to terminate session");
      } else {
        router.refresh();
      }
    } catch {
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleTerminate}
      disabled={loading}
    >
      {loading ? "Terminating…" : "Terminate"}
    </Button>
  );
}

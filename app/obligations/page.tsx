"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ObligationsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new Contract Hub
    router.replace("/contracts");
  }, [router]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <p className="text-sm text-muted-foreground">Redirecting to Contract Hub...</p>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(path: string, body?: object): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(problem?.detail ?? "Could not save the checklist. Try again.");
  }
}

export function StartSpotCheck() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <>
    <button className="btn" type="button" disabled={busy} onClick={() => {
      setBusy(true); setError(null);
      void post("/api/v1/baseline-checks/start")
        .then(() => router.refresh())
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not start checklist."))
        .finally(() => setBusy(false));
    }}>Draw random checklist</button>
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}

export function SpotCheckActions({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function answer(agreed: boolean) {
    setBusy(true); setError(null);
    try {
      await post("/api/v1/baseline-checks/answer", { id, agreed });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save answer.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="spot-actions">
    <button type="button" disabled={busy} onClick={() => void answer(true)} className="btn">Confirm</button>
    <button type="button" disabled={busy} onClick={() => void answer(false)} className="btn btn-secondary">Reject</button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

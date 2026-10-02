"use client";

import { useState, type FormEvent } from "react";
import { routes } from "@/lib/api-contract";

function detailFrom(body: unknown): string | null {
  return body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : null;
}

export function DeleteMyData() {
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/account", { method: "DELETE" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(detailFrom(body) ?? "Could not delete your data. Try again.");
      routes.deleteMyData.responses[200].parse(body);
      window.location.assign("/?account=deleted");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete your data. Try again.");
      setDeleting(false);
    }
  }

  return <form className="delete-my-data" onSubmit={submit}>
    <label>
      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      I understand this permanently deletes my sign-in account, Invitee record, feedback and usage events.
    </label>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="btn btn-danger" type="submit" disabled={!confirmed || deleting}>
      {deleting ? "Deleting…" : "Delete account and data"}
    </button>
  </form>;
}

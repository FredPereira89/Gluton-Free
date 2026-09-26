"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FORMATS, type PriceTier } from "@/domain/restaurant-facts";

const PRICE_TIERS: PriceTier[] = ["€", "€€", "€€€", "€€€€"];
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function RestaurantFactsEditor({
  slug,
  format: initialFormat,
  priceTier: initialPriceTier,
  busy,
}: {
  slug: string;
  format: string;
  priceTier: string | null;
  busy: boolean;
}) {
  const router = useRouter();
  const [format, setFormat] = useState(initialFormat);
  const [priceTier, setPriceTier] = useState(initialPriceTier ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFormat(initialFormat);
    setPriceTier(initialPriceTier ?? "");
  }, [initialFormat, initialPriceTier]);

  const formatChanged = format !== initialFormat;
  const priceChanged = priceTier !== (initialPriceTier ?? "");

  async function save() {
    if (!formatChanged && !priceChanged) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const update: { format?: string; priceTier?: PriceTier | null } = {};
    if (formatChanged) update.format = format;
    if (priceChanged) update.priceTier = priceTier ? priceTier as PriceTier : null;
    try {
      const response = await fetch(`/api/v1/restaurants/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string; title?: string } | null;
        throw new Error(body?.detail ?? body?.title ?? "Could not save Restaurant details. Try again.");
      }
      setMessage(formatChanged ? "Format saved. A new Verdict is being judged." : "Price tier saved.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save Restaurant details. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="restaurant-facts-editor">
    <label className="field">
      Format
      <select value={format} disabled={busy || submitting} onChange={(event) => setFormat(event.target.value)}>
        {FORMATS.map((option) => <option key={option} value={option}>{label(option)}</option>)}
      </select>
    </label>
    <label className="field">
      Price tier
      <select value={priceTier} disabled={busy || submitting} onChange={(event) => setPriceTier(event.target.value)}>
        <option value="">Not set</option>
        {PRICE_TIERS.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
    <button type="button" className="btn" disabled={busy || submitting || (!formatChanged && !priceChanged)} onClick={() => void save()}>
      Save Restaurant details
    </button>
    {busy && <p className="small muted">Wait for the current job to finish before changing these details.</p>}
    {message && <p className="small muted" role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

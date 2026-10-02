"use client";

import { useState } from "react";
import { welcomeDismissedCookie } from "@/domain/welcome";
import { CloseIcon } from "@/web/icons";

/** First-visit welcome (issue #119). The server renders it only until the dismissal cookie exists. */
export function WelcomeCard({ restaurantsCount }: { restaurantsCount: number }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const dismiss = () => {
    try { document.cookie = welcomeDismissedCookie(); } catch { /* Hidden for this view even if the browser blocks cookies. */ }
    setDismissed(true);
  };
  return <aside className="welcome-card" aria-label="Welcome">
    <p>Browse {restaurantsCount.toLocaleString("en")} Lisbon Restaurants, each judged against its own kind.</p>
    <button type="button" className="welcome-dismiss" aria-label="Dismiss welcome" onClick={dismiss}><CloseIcon size={16} /></button>
  </aside>;
}

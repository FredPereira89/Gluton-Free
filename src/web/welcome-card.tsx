"use client";

import { useState } from "react";
import { welcomeDismissedCookie } from "@/domain/welcome";

/** First-visit welcome (issue #119). The server renders it only until the dismissal cookie exists. */
export function WelcomeCard() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const dismiss = () => {
    try { document.cookie = welcomeDismissedCookie(); } catch { /* Hidden for this view even if the browser blocks cookies. */ }
    setDismissed(true);
  };
  return <aside className="welcome-card" aria-label="Welcome">
    <ul>
      <li>Lisbon only, about 330 restaurants</li>
      <li>each judged against its own kind</li>
      <li>tell us when we&apos;re wrong</li>
    </ul>
    <button type="button" className="btn btn-secondary" onClick={dismiss}>Dismiss</button>
  </aside>;
}

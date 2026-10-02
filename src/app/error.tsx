"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="state-page" role="alert">
      <h1>Something went wrong</h1>
      <p className="muted">This page did not load. Nothing you entered was lost. Try again, or go back to the directory.</p>
      <div className="state-actions">
        <button className="btn" type="button" onClick={() => retry()}>Try again</button>
        <Link className="btn btn-secondary" href="/">All Restaurants</Link>
      </div>
      {error.digest && <p className="small muted">Reference: {error.digest}</p>}
    </div>
  );
}

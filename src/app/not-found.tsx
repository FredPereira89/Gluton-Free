import Link from "next/link";

export default function NotFound() {
  return (
    <div className="state-page">
      <h1>We can&apos;t find that page</h1>
      <p className="muted">The link may be old, or the Restaurant may have been removed.</p>
      <div className="state-actions">
        <Link className="btn" href="/">All Restaurants</Link>
      </div>
    </div>
  );
}

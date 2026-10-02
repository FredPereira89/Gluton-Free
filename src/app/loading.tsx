// Instant fallback for any page that has no skeleton of its own. Heights track the Directory so the swap does not shift the page.
export default function Loading() {
  return (
    <div className="skeleton-page wide" role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="skel skel-title" aria-hidden="true" />
      <div className="skel skel-bar" aria-hidden="true" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="skel skel-row" aria-hidden="true" />)}
    </div>
  );
}

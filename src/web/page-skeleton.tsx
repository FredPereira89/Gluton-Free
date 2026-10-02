// Loading shape for the 720px pages (settings, feedback, baseline checks, account). Heights track the cards so the swap does not shift the page.
export function PageSkeleton() {
  return (
    <div className="skeleton-page" role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="skel skel-title" aria-hidden="true" />
      {[0, 1, 2].map((i) => <div key={i} className="skel skel-card" aria-hidden="true" />)}
    </div>
  );
}

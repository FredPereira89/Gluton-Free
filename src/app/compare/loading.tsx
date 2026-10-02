export default function Loading() {
  return (
    <div className="skeleton-page" role="status" aria-busy="true">
      <span className="sr-only">Loading the comparison</span>
      <div className="skel skel-title" aria-hidden="true" />
      <div className="compare-grid" aria-hidden="true">
        {[0, 1].map((i) => <div key={i} className="skel skel-card" />)}
      </div>
    </div>
  );
}

// Report skeleton: the hero lobe at its settled height, so the Tier, reason and Book link land without moving the page.
export default function Loading() {
  return (
    <div className="A" role="status" aria-busy="true">
      <span className="sr-only">Loading the report</span>
      <section className="hero skeleton-hero" aria-hidden="true">
        <div className="skel skel-title" />
        <div className="skel skel-line short" />
        <div className="skel skel-tier" />
        <div className="skel skel-line" />
        <div className="skel skel-line" />
        <div className="skel skel-line short" />
        <div className="skel skel-book" />
      </section>
    </div>
  );
}

// Drawn icons: no client code, so server and client components can both use them.
/** Drawn icons are decorative: the words next to them carry the meaning. */
export function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>;
}

const STAR = "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z";

/** A Review's star count: filled stars against outlined ones, so the count never rests on colour. */
export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} className={n <= value ? "star on" : "star"} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={STAR} /></svg>
      ))}
    </span>
  );
}

/** Marks a link that leaves the app. Always sits beside link text, never alone. */
export function ExternalIcon() {
  return <Icon d="M7 17L17 7M9 7h8v8" size={14} />;
}

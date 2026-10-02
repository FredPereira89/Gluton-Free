// Drawn icons: no client code, so server and client components can both use them.
/** Drawn icons are decorative: the words next to them carry the meaning. */
export function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>;
}

/** Marks a link that leaves the app. Always sits beside link text, never alone. */
export function ExternalIcon() {
  return <Icon d="M7 17L17 7M9 7h8v8" size={14} />;
}

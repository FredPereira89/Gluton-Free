"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

export function DirectoryReturnLink({ href, returnTo, children }: { href: string; returnTo: string; children: ReactNode }) {
  function rememberScroll(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try {
      sessionStorage.setItem(`gluton-directory-scroll:${returnTo}`, String(window.scrollY));
    } catch {
      // Returning still works when session storage is unavailable.
    }
  }

  return <Link href={href} onClick={rememberScroll}>{children}</Link>;
}

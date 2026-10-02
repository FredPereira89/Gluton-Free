"use client";

import Link from "next/link";
import { useEffect, useRef, type ComponentProps } from "react";
import type { UsageEventType } from "@/lib/api-contract";

export function trackUsageEvent(type: UsageEventType): void {
  try {
    const eventKey = crypto.randomUUID();
    void fetch("/api/v1/usage-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventKey, type }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Usage capture never blocks the action the Invitee took.
  }
}

export function UsageEventOnMount({ type, actionKey }: { type: UsageEventType; actionKey: string }) {
  const sentFor = useRef<string | null>(null);
  useEffect(() => {
    if (sentFor.current === actionKey) return;
    sentFor.current = actionKey;
    trackUsageEvent(type);
  }, [actionKey, type]);
  return null;
}

export function UsageTrackedLink({ track, eventType = "booking_link_clicked", onClick, ...props }: ComponentProps<"a"> & { track: boolean; eventType?: UsageEventType }) {
  return <a {...props} onClick={(event) => {
    if (track) trackUsageEvent(eventType);
    onClick?.(event);
  }} />;
}

export function UsageTrackedNavLink({ track, eventType, onClick, ...props }: Omit<ComponentProps<typeof Link>, "onClick"> & {
  track: boolean;
  eventType: UsageEventType;
  onClick?: ComponentProps<typeof Link>["onClick"];
}) {
  return <Link {...props} onClick={(event) => {
    if (track) trackUsageEvent(eventType);
    onClick?.(event);
  }} />;
}

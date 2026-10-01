"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { InviteLink, InviteeRecord } from "@/lib/invite";

const day = (iso: string) => iso.slice(0, 10);
const minute = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;

/** Sends a JSON request to an owner route, refreshes the page's data on success, reports a failure. */
function useAdminRequest() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: string, path: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, {
        method,
        cache: "no-store",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { detail?: string; title?: string } | null;
        throw new Error(problem?.detail ?? problem?.title ?? "That didn't work. Try again.");
      }
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, send };
}

function InviteLinkRow({ link, origin }: { link: InviteLink; origin: string }) {
  const { busy, error, send } = useAdminRequest();
  const [copied, setCopied] = useState(false);
  const url = `${origin}/invite/${link.token}`;
  const exhausted = link.useCap !== null && link.useCount >= link.useCap;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <li className="invite-row">
      <div>
        <strong>{link.label}</strong>
        <p className="small muted">
          {link.useCount}{link.useCap === null ? " joined" : ` of ${link.useCap} used`}
          {link.revoked ? " · revoked" : exhausted ? " · full" : ""}
        </p>
      </div>
      {!link.revoked && (
        <>
          <input className="invite-url" readOnly value={url} aria-label={`Invite link URL for ${link.label}`} onFocus={(event) => event.currentTarget.select()} />
          <div className="invite-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void send("POST", `/api/v1/invite-links/${link.id}/revoke`)}>
              {busy ? "Revoking…" : "Revoke"}
            </button>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </li>
  );
}

export function InviteLinksAdmin({ links }: { links: InviteLink[] }) {
  const { busy, error, send } = useAdminRequest();
  const [label, setLabel] = useState("");
  const [cap, setCap] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  async function create(event: FormEvent) {
    event.preventDefault();
    const useCap = cap.trim() === "" ? null : Number(cap);
    if (await send("POST", "/api/v1/invite-links", { label, useCap })) {
      setLabel("");
      setCap("");
    }
  }

  return (
    <section className="settings-section" aria-labelledby="invite-links-heading">
      <h2 id="invite-links-heading">Invite links</h2>
      <p>Anyone with a live link can join as an Invitee. Revoke a link to stop new sign-ups.</p>
      <form className="form" onSubmit={(event) => void create(event)}>
        <label className="field">
          Label
          <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} required placeholder="LinkedIn post" />
        </label>
        <label className="field">
          Use cap (optional)
          <input value={cap} onChange={(event) => setCap(event.target.value)} type="number" min={1} max={100000} step={1} inputMode="numeric" placeholder="No limit" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Creating…" : "Create link"}</button>
      </form>
      {links.length === 0 ? <p className="small muted">No links yet.</p> : (
        <ul className="invite-list">
          {links.map((link) => <InviteLinkRow key={link.id} link={link} origin={origin} />)}
        </ul>
      )}
    </section>
  );
}

function InviteeRow({ invitee }: { invitee: InviteeRecord }) {
  const { busy, error, send } = useAdminRequest();
  const lock = !invitee.lockedOut;
  return (
    <li className="invite-row">
      <div>
        <strong>{invitee.email ?? invitee.userId}</strong>
        <p className="small muted">
          {invitee.inviteLink ? `via ${invitee.inviteLink.label}` : "no link"} · joined {day(invitee.joinedAt)} · last seen {invitee.lastSeenAt ? minute(invitee.lastSeenAt) : "never"}
          {invitee.lockedOut ? " · locked out" : ""}
        </p>
      </div>
      <div className="invite-actions">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void send("PATCH", `/api/v1/invitees/${invitee.userId}`, { lockedOut: lock })}>
          {lock ? "Lock out" : "Let back in"}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </li>
  );
}

export function InviteesAdmin({ invitees }: { invitees: InviteeRecord[] }) {
  return (
    <section className="settings-section" aria-labelledby="invitees-heading">
      <h2 id="invitees-heading">Invitees</h2>
      <p>Locking someone out ends their session right away.</p>
      {invitees.length === 0 ? <p className="small muted">Nobody has joined yet.</p> : (
        <ul className="invite-list">
          {invitees.map((invitee) => <InviteeRow key={invitee.userId} invitee={invitee} />)}
        </ul>
      )}
    </section>
  );
}

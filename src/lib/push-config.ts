import { createECDH } from "node:crypto";

/** Return the browser-safe VAPID key only when the configured P-256 key pair matches. */
export function configuredVapidPublicKey(): string | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(publicKey) || !/^[A-Za-z0-9_-]+$/.test(privateKey)) return null;

  const decodedPublicKey = Buffer.from(publicKey, "base64url");
  const decodedPrivateKey = Buffer.from(privateKey, "base64url");
  if (decodedPublicKey.length !== 65 || decodedPublicKey[0] !== 4 || decodedPrivateKey.length !== 32) return null;
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(decodedPrivateKey);
    if (!ecdh.getPublicKey(undefined, "uncompressed").equals(decodedPublicKey)) return null;
  } catch {
    return null;
  }
  return publicKey;
}

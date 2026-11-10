/**
 * Household tokens: "<base64url(householdId.expiry)>.<base64url(hmac)>".
 * Issued after a successful name lookup and in confirmation emails, so a guest
 * can come back and edit without searching again. Nothing is stored server-side;
 * rotating TOKEN_SECRET invalidates every outstanding link.
 */
const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signHouseholdToken(secret: string, householdId: number, expiresAt: Date): Promise<string> {
  const payload = `${householdId}.${Math.floor(expiresAt.getTime() / 1000)}`;
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(payload));
  return `${b64url(enc.encode(payload))}.${b64url(sig)}`;
}

/** Returns the household id, or null if the token is malformed, forged, or expired. */
export async function verifyHouseholdToken(secret: string, token: string): Promise<number | null> {
  const parts = token.split('.');
  if (parts.length !== 2 || token.length > 200) return null;
  try {
    const payloadBytes = fromB64url(parts[0]);
    const ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(parts[1]), payloadBytes);
    if (!ok) return null;
    const [id, exp] = new TextDecoder().decode(payloadBytes).split('.').map(Number);
    if (!Number.isInteger(id) || !Number.isInteger(exp) || exp * 1000 < Date.now()) return null;
    return id;
  } catch {
    return null;
  }
}

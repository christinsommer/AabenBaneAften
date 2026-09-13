export const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function unhex(value: string) { const out = new Uint8Array(value.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16); return out; }
export async function sha256(value: string) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }

export async function hashToken(value: string) {
  return sha256(value);
}

export async function verifyToken(value: string, stored: string) {
  return (await hashToken(value)) === stored;
}

export async function hashPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return `${hex(salt)}:${hex(new Uint8Array(bits))}`;
}
export async function verifyPin(pin: string, stored: string) {
  const [salt, expected] = stored.split(":"); if (!salt || !expected) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const actual = hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations: 100000 }, key, 256)));
  if (actual.length !== expected.length) return false; let diff = 0; for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i); return diff === 0;
}


import bcrypt from "bcryptjs";
const cost = 12;
const byteLength = (value: string) => new TextEncoder().encode(value).length;
export async function hashPassword(password: string) {
  if (password.length < 12 || byteLength(password) > 72) throw new Error("Password must be 12 to 72 bytes");
  return bcrypt.hash(password, cost);
}
function equalHash(a: string, b: string) { if (a.length !== b.length) return false; let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0; }
export async function verifyPassword(email: string, password: string, stored?: string): Promise<{ valid: boolean; upgrade?: string }> {
  if (!stored || password.length > 4096) { await bcrypt.hash("invalid-login", cost); return { valid: false }; }
  if (/^\$2[aby]\$/.test(stored)) return { valid: byteLength(password) <= 72 && await bcrypt.compare(password, stored) };
  if (!/^[a-f0-9]{64}$/i.test(stored)) return { valid: false };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`nfc-v1:${email.toLowerCase()}:${password}`));
  const legacy = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const valid = equalHash(legacy, stored);
  const upgrade = await bcrypt.hash(valid && byteLength(password) <= 72 ? password : "invalid-login", cost);
  return valid ? { valid: true, ...(byteLength(password) <= 72 ? { upgrade } : {}) } : { valid: false };
}

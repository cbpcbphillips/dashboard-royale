// Staff sign-in sessions (D-084): a signed, HttpOnly cookie holding who is signed in and their role.
// Used by proxy.ts (every request) and the server actions in app/login. No database: staff accounts
// live in the STAFF_ACCOUNTS environment variable (see scripts/add-staff.mjs).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "gilded_session";
export const SESSION_HOURS = 8;

export type Session = { name: string; email: string; role: "staff" | "demo" };

function key(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  return s && s.length >= 32 ? new TextEncoder().encode(s) : null;
}

export const authConfigured = () => key() !== null;

/** True only for a path on this site ("/plan?x=1"). Rejects "//host", "/\host" (browsers read "\" as "/"),
 *  absolute URLs and control characters, so the post-sign-in redirect can't leave the site. */
export function isLocalPath(p: string): boolean {
  if (!p.startsWith("/") || p.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(p)) return false;
  try {
    return new URL(p, "https://local.invalid").origin === "https://local.invalid";
  } catch {
    return false;
  }
}

export async function signSession(s: Session): Promise<string> {
  const k = key();
  if (!k) throw new Error("AUTH_SECRET is not set (at least 32 characters)");
  return new SignJWT({ name: s.name, role: s.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.email)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(k);
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  const k = key();
  if (!token || !k) return null;
  try {
    const { payload } = await jwtVerify(token, k, { algorithms: ["HS256"] });
    const role = payload.role === "staff" || payload.role === "demo" ? payload.role : null;
    if (!role || typeof payload.sub !== "string") return null;
    return { email: payload.sub, name: typeof payload.name === "string" ? payload.name : payload.sub, role };
  } catch {
    return null;
  }
}

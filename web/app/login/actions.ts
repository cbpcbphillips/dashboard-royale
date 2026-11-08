"use server";

import { scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_HOURS, type Session, signSession } from "@/lib/session";

// STAFF_ACCOUNTS = "email|Display Name|salt|hash;email|Display Name|salt|hash" (hex scrypt, 64-byte key),
// created with `node scripts/add-staff.mjs`. Passwords themselves are never stored.
function findStaff(email: string, password: string): Session | null {
  const want = email.trim().toLowerCase();
  for (const entry of (process.env.STAFF_ACCOUNTS ?? "").split(";")) {
    const [e, name, salt, hash] = entry.trim().split("|");
    if (!e || !salt || !hash || e.toLowerCase() !== want) continue;
    const got = scryptSync(password, Buffer.from(salt, "hex"), 64);
    const exp = Buffer.from(hash, "hex");
    if (exp.length === got.length && timingSafeEqual(exp, got)) return { email: want, name: name || want, role: "staff" };
    return null;
  }
  scryptSync(password, Buffer.alloc(16), 64); // same work when the email is unknown
  return null;
}

const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
};

async function start(session: Session, next: string) {
  (await cookies()).set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  redirect(next);
}

export type LoginState = { error?: string };

export async function signIn(_: LoginState, form: FormData): Promise<LoginState> {
  if (!process.env.AUTH_SECRET) return { error: "Sign-in isn't set up on this server yet." };
  const user = findStaff(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!user) return { error: "That email and password don't match a staff account." };
  await start(user, safeNext(form.get("next")));
  return {};
}

export async function demoAccess(form: FormData) {
  await start({ email: "demo@gilded-ace.example", name: "Judge (demo access)", role: "demo" }, safeNext(form.get("next")));
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

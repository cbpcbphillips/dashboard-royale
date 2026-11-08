import { cookies } from "next/headers";
import { connection } from "next/server";
import { signOut } from "@/app/login/actions";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/** Who is signed in, with a sign-out button. Reads the session cookie, so it renders inside <Suspense>. */
export async function UserMenu() {
  await connection(); // checking the session uses the current time, so render at request time
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  return (
    <form action={signOut} className="user-menu">
      <span className={`user-chip${s.role === "demo" ? " demo" : ""}`} title={s.email}>{s.role === "demo" ? "Demo access" : s.name}</span>
      <button type="submit" className="link-btn">Sign out</button>
    </form>
  );
}

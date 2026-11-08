import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Staff-only access (D-084): every page and the API need a valid session; otherwise go to /login.
// Judges get in with one click through "Judge / demo access" on the sign-in page.
export async function proxy(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const url = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // everything except the sign-in page, Next.js assets and static files
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|webp|txt)$).*)"],
};

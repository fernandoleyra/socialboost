import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authEnabled, icsKey, safeEqual, sessionToken } from "@/lib/auth";

/** Paths reachable without a session when the password gate is on. */
const PUBLIC = ["/login", "/api/auth/login", "/icon.svg"];

export function proxy(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname, searchParams } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  if (pathname === "/api/calendar/ics" && safeEqual(searchParams.get("key") ?? "", icsKey())) return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, sessionToken())) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in", hint: "Open SocialBoost in your browser and sign in." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authEnabled, safeEqual, sessionToken } from "@/lib/auth";
import { allowedHosts, isAllowedLocalHost, isCrossSiteWrite } from "@/lib/request-guard";

/** Paths reachable without a session when the password gate is on. */
const PUBLIC = ["/login", "/api/auth/login", "/icon.svg"];

function refuse(pathname: string, error: string, hint: string) {
  if (pathname.startsWith("/api/")) return NextResponse.json({ error, hint }, { status: 403 });
  return new NextResponse(`${error} ${hint}`, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Another site's page posting into the studio (CSRF), with or without the password gate.
  if (isCrossSiteWrite(req.method, req.headers)) {
    return refuse(pathname, "Cross-site request blocked.", "Use SocialBoost from its own page.");
  }

  if (!authEnabled()) {
    // Without a password only localhost may open the studio. This also stops DNS-rebinding pages.
    if (!isAllowedLocalHost(req.headers.get("host"), allowedHosts())) {
      return refuse(
        pathname,
        "This address isn't allowed.",
        "Open SocialBoost as http://localhost on the computer it runs on, or set SOCIALBOOST_PASSWORD to use it from another address.",
      );
    }
    return NextResponse.next();
  }

  if (PUBLIC.includes(pathname)) return NextResponse.next();
  // Calendar apps can't send the cookie; the route itself checks the profile's random feed token.
  if (pathname === "/api/calendar/ics" && (req.method === "GET" || req.method === "HEAD")) return NextResponse.next();

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

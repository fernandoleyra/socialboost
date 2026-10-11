import { z } from "zod";
import { NextResponse } from "next/server";
import { handle, HttpError } from "@/lib/http";
import { AUTH_COOKIE, LoginThrottle, authEnabled, checkPassword, sessionToken } from "@/lib/auth";

const throttle = new LoginThrottle();

export const POST = handle(async (req: Request) => {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  const { password } = z.object({ password: z.string().max(500) }).parse(await req.json());
  // No await from here until the throttle is updated: concurrent guesses can't slip through the lock.
  const wait = throttle.retryAfter();
  if (wait > 0) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a moment and try again." },
      { status: 429, headers: { "retry-after": String(Math.ceil(wait / 1000)) } },
    );
  }
  if (!checkPassword(password)) {
    throttle.fail();
    throw new HttpError(401, "That password didn't work.");
  }
  throttle.succeed();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
});

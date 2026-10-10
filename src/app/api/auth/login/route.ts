import { z } from "zod";
import { NextResponse } from "next/server";
import { handle, HttpError } from "@/lib/http";
import { AUTH_COOKIE, authEnabled, checkPassword, sessionToken } from "@/lib/auth";

let failures = 0;

export const POST = handle(async (req: Request) => {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  const { password } = z.object({ password: z.string().max(500) }).parse(await req.json());
  if (!checkPassword(password)) {
    // Slow down guessing; resets after a successful sign-in.
    failures = Math.min(failures + 1, 10);
    await new Promise((r) => setTimeout(r, 400 * failures));
    throw new HttpError(401, "That password didn't work.");
  }
  failures = 0;
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

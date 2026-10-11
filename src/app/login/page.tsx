import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authEnabled, safeNextPath } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in · SocialBoost" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!authEnabled()) redirect("/");
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <LoginForm next={next} />
    </main>
  );
}

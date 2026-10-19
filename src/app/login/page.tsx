import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import {
  SESSION_COOKIE,
  authMode,
  safeNextPath,
  verifySessionToken,
} from "@/lib/auth/session";

/** Never cached: whether you are signed in is decided per request. */
export const dynamic = "force-dynamic";

export const metadata = { title: "Lanework — Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  const mode = authMode();

  // Already signed in, or running locally with no password: nothing to do here.
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (mode === "disabled-dev" || (mode === "enforced" && (await verifySessionToken(cookie)))) {
    redirect(next);
  }

  return <LoginForm next={next} misconfigured={mode === "misconfigured"} />;
}

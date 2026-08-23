import { redirect } from "next/navigation";

import { isAppAdmin } from "@/lib/access";
import { getCachedSession } from "@/lib/auth-server";
import { LoginForm } from "./LoginForm";

const ERROR_MESSAGES: Record<string, string> = {
  "not-admin": "That account does not have admin access to this console.",
};

function safeRedirect(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/post-to-social";
  }
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.redirect);

  const session = await getCachedSession();
  if (session.user && isAppAdmin(session.user) && !params.error) {
    redirect(redirectTo);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-gray-900">Zvastra Admin</h1>
          <p className="text-sm text-gray-600">Admin accounts only.</p>
        </div>

        <LoginForm
          redirectTo={redirectTo}
          initialError={params.error ? ERROR_MESSAGES[params.error] : undefined}
        />
      </div>
    </div>
  );
}

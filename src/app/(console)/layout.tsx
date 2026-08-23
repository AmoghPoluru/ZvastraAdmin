import { requireAdmin } from "@/lib/require-admin";
import { TRPCReactProvider } from "@/trpc/client";

/** Every console route reads the Payload session, so nothing here is prerenderable. */
export const dynamic = "force-dynamic";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireAdmin("/post-to-social");

  return (
    <TRPCReactProvider>
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <span className="text-sm font-semibold text-gray-900">Zvastra Admin</span>
            <form action="/logout" method="post" className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button
                type="submit"
                className="text-sm font-medium text-gray-700 underline hover:text-gray-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </TRPCReactProvider>
  );
}

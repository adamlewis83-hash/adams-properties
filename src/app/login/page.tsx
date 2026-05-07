import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-[10px] font-bold tracking-tight shadow-sm">JAM</span>
          <h1 className="text-xl font-semibold tracking-tight">JAM Property Management</h1>
        </div>

        {sent ? (
          <>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-4 text-sm">
              <p className="font-medium text-emerald-800 dark:text-emerald-300">
                Check your inbox.
              </p>
              <p className="mt-1 text-emerald-700 dark:text-emerald-400">
                We sent a sign-in link to <strong>{decodeURIComponent(sent)}</strong>. Click the link to finish signing in. The link expires in 60 minutes.
              </p>
            </div>
            <p className="text-xs text-zinc-500">
              Didn&apos;t get it? Check your spam folder, or{" "}
              <a href="/login" className="underline">try again</a>.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-500">Enter your email to receive a one-time sign-in link.</p>
            {error && <p className="text-sm text-red-600">{decodeURIComponent(error)}</p>}
            <form action={login} className="space-y-3">
              <label className="block text-sm">
                <span className="block mb-1">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
                  placeholder="you@example.com"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2 font-medium"
              >
                Send sign-in link
              </button>
            </form>
            <p className="text-xs text-zinc-500">
              No password required. New here? You&apos;ll need an invite from an admin first.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

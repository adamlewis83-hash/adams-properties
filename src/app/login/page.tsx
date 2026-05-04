import { login } from "./actions";
import { BRAND_NAME } from "@/lib/brand";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <form action={login} className="w-full max-w-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
        <h1 className="text-xl font-semibold">{BRAND_NAME}</h1>
        <p className="text-sm text-zinc-500">Sign in to continue</p>
        {error && <p className="text-sm text-red-600">{decodeURIComponent(error)}</p>}
        <label className="block text-sm">
          <span className="block mb-1">Email</span>
          <input name="email" type="email" required className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="block mb-1">Password</span>
          <input name="password" type="password" required className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2" />
        </label>
        <button type="submit" className="w-full rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2 font-medium">
          Sign in
        </button>
        <p className="text-xs text-zinc-500">
          No account yet? Create one in Supabase dashboard → Authentication → Users → Add user.
        </p>
      </form>
    </div>
  );
}

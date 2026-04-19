"use client";

export default function AssetsError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-2">Assets page error</h1>
      <pre className="text-sm bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded p-3 whitespace-pre-wrap">
        {error.message}
        {error.stack ? `\n\n${error.stack}` : ""}
        {error.digest ? `\n\nDigest: ${error.digest}` : ""}
      </pre>
    </div>
  );
}

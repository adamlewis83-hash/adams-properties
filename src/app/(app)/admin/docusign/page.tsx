import { PageShell, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { readDocuSignConfig } from "@/lib/docusign";

export const dynamic = "force-dynamic";

export default async function DocuSignSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const granted = sp.granted === "1";
  const cfg = readDocuSignConfig();

  const missing = "missing" in cfg ? cfg.missing : null;

  // Build the DocuSign consent URL (sandbox vs prod is determined by authServer env).
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY ?? "";
  const authServer = process.env.DOCUSIGN_AUTH_SERVER ?? "account-d.docusign.com";
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL?.replace(/^https?:\/\//, "").replace(/^/, "https://") ||
    "https://adams-properties.vercel.app";
  const redirectUri = `${baseUrl.replace(/\/$/, "")}/admin/docusign?granted=1`;
  const consentUrl =
    `https://${authServer}/oauth/auth?response_type=code` +
    `&scope=signature%20impersonation` +
    `&client_id=${encodeURIComponent(integrationKey)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return (
    <PageShell title="DocuSign integration">
      <Card title="Status">
        {missing ? (
          <div className="space-y-3 text-sm">
            <p className="text-rose-700 dark:text-rose-400 font-medium">
              DocuSign is not configured yet.
            </p>
            <p className="text-zinc-700 dark:text-zinc-300">
              Set the following environment variables in Vercel
              (Settings → Environment Variables → Production), then redeploy:
            </p>
            <ul className="list-disc ml-6 space-y-1 text-zinc-700 dark:text-zinc-300">
              {missing.map((m) => (
                <li key={m} className="font-mono text-xs">DOCUSIGN_{m.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase().replace(/^_/, "")}</li>
              ))}
            </ul>
            <p className="text-zinc-600 dark:text-zinc-400 text-xs">
              See the full list of required env vars below in the &ldquo;Setup&rdquo; section.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-emerald-700 dark:text-emerald-400 font-medium">
              ✓ DocuSign env vars are present.
            </p>
            {granted ? (
              <p className="text-emerald-700 dark:text-emerald-400">
                ✓ Consent grant returned. The API user can now impersonate via JWT.
                You can now send leases for signature from any lease detail page.
              </p>
            ) : (
              <>
                <p>
                  Last step: <strong>grant one-time consent</strong> so the API user
                  can sign on your behalf via JWT. Click the button below, sign in
                  to DocuSign with the same account that owns the integration key,
                  and click <em>Allow</em>.
                </p>
                <a
                  href={consentUrl}
                  className="inline-flex items-center rounded bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium"
                >
                  Grant DocuSign consent
                </a>
                <p className="text-xs text-zinc-500">
                  You only need to do this once per environment (sandbox / prod).
                </p>
              </>
            )}
          </div>
        )}
      </Card>

      <Card title="Setup">
        <ol className="list-decimal ml-5 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            <strong>Create a DocuSign developer account</strong> at{" "}
            <a href="https://developers.docusign.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              developers.docusign.com
            </a>{" "}
            (free for testing). When you&apos;re ready for live tenants, you&apos;ll
            promote the integration to production via Go-Live in the DocuSign admin.
          </li>
          <li>
            <strong>Create an Integration Key</strong> under My Apps & Keys:
            <ul className="list-disc ml-5 mt-1 space-y-0.5">
              <li>Auth method: <em>Authorization Code Grant</em> AND <em>JWT Grant</em></li>
              <li>Redirect URI: <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{`${baseUrl.replace(/\/$/, "")}/admin/docusign?granted=1`}</code></li>
              <li>Generate an RSA keypair and save the <strong>private key</strong> (PEM).</li>
            </ul>
          </li>
          <li>
            <strong>Find your User ID and Account ID</strong> in DocuSign Admin → Settings → Users.
          </li>
          <li>
            <strong>Set environment variables</strong> in Vercel (Production):
            <pre className="mt-2 p-3 rounded bg-zinc-100 dark:bg-zinc-900 text-xs overflow-x-auto"><code>{`DOCUSIGN_INTEGRATION_KEY=<integration-key-guid>
DOCUSIGN_USER_ID=<api-user-guid>
DOCUSIGN_ACCOUNT_ID=<account-guid>
DOCUSIGN_PRIVATE_KEY=<paste-PEM-with-actual-newlines-or-escape-as-\\n>
DOCUSIGN_BASE_URL=https://demo.docusign.net           # or https://www.docusign.net for prod
DOCUSIGN_AUTH_SERVER=account-d.docusign.com           # or account.docusign.com for prod`}</code></pre>
          </li>
          <li>
            <strong>Redeploy</strong> the Vercel app so the env vars take effect.
          </li>
          <li>
            <strong>Click Grant DocuSign consent</strong> above (one-time per environment).
          </li>
          <li>
            On any lease detail page, the <strong>DocuSign</strong> card replaces the old
            E-Sig card. Click <em>Send for signature</em> and the lease (uploaded PDF if
            you have one, otherwise the auto-generated one) gets emailed to the tenant
            via DocuSign with anchor-based signature placement.
          </li>
        </ol>
      </Card>
    </PageShell>
  );
}

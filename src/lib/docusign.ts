/**
 * DocuSign eSignature integration via direct REST API + JWT auth.
 *
 * Avoids the docusign-esign SDK because its CommonJS / AMD module pattern
 * doesn't bundle cleanly under Turbopack. We sign the JWT with Node's
 * built-in crypto and make REST calls with fetch — much smaller and more
 * portable.
 *
 * Required env vars (set in Vercel → Settings → Environment Variables):
 *   DOCUSIGN_INTEGRATION_KEY   — Integration Key from your DocuSign app
 *   DOCUSIGN_USER_ID           — User GUID for the API user
 *   DOCUSIGN_ACCOUNT_ID        — DocuSign account ID
 *   DOCUSIGN_PRIVATE_KEY       — RSA private key (PEM, with literal \n preserved)
 *   DOCUSIGN_BASE_URL          — e.g. "https://demo.docusign.net" (sandbox) or
 *                                "https://www.docusign.net" (production)
 *   DOCUSIGN_AUTH_SERVER       — "account-d.docusign.com" (sandbox) or
 *                                "account.docusign.com" (production)
 */
import { createSign } from "crypto";

export type DocuSignConfig = {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKey: string;
  baseUrl: string;
  authServer: string;
};

export function readDocuSignConfig(): DocuSignConfig | { missing: string[] } {
  const required: Array<keyof DocuSignConfig> = [
    "integrationKey",
    "userId",
    "accountId",
    "privateKey",
    "baseUrl",
    "authServer",
  ];
  const fromEnv: Record<keyof DocuSignConfig, string | undefined> = {
    integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY,
    userId: process.env.DOCUSIGN_USER_ID,
    accountId: process.env.DOCUSIGN_ACCOUNT_ID,
    privateKey: process.env.DOCUSIGN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    baseUrl: process.env.DOCUSIGN_BASE_URL,
    authServer: process.env.DOCUSIGN_AUTH_SERVER,
  };
  const missing = required.filter((k) => !fromEnv[k]);
  if (missing.length) return { missing: missing.map(String) };
  return fromEnv as DocuSignConfig;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Sign and request a JWT user token for the API user, returning the access token.
 */
async function getAccessToken(): Promise<{ token: string; accountId: string; baseUrl: string }> {
  const cfg = readDocuSignConfig();
  if ("missing" in cfg) {
    throw new Error(`DocuSign not configured. Missing env vars: ${cfg.missing.join(", ")}`);
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: cfg.integrationKey,
    sub: cfg.userId,
    aud: cfg.authServer,
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation",
  }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = base64url(signer.sign(cfg.privateKey));
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(`https://${cfg.authServer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    // The most common failure is "consent_required" — direct the caller to /admin/docusign.
    throw new Error(`DocuSign auth failed (${res.status}): ${data.error ?? ""} ${data.error_description ?? ""}`.trim());
  }
  return {
    token: data.access_token as string,
    accountId: cfg.accountId,
    baseUrl: cfg.baseUrl.replace(/\/$/, ""),
  };
}

/**
 * Send an envelope: takes a PDF buffer + recipient info, creates and sends the envelope.
 * Returns the envelope ID.
 */
export async function sendEnvelope({
  pdfBytes,
  pdfName,
  emailSubject,
  emailBody,
  signerName,
  signerEmail,
}: {
  pdfBytes: Buffer;
  pdfName: string;
  emailSubject: string;
  emailBody: string;
  signerName: string;
  signerEmail: string;
}): Promise<{ envelopeId: string; status: string }> {
  const { token, accountId, baseUrl } = await getAccessToken();

  const envelope = {
    emailSubject,
    emailBlurb: emailBody,
    documents: [
      {
        documentBase64: pdfBytes.toString("base64"),
        name: pdfName,
        fileExtension: "pdf",
        documentId: "1",
      },
    ],
    recipients: {
      signers: [
        {
          email: signerEmail,
          name: signerName,
          recipientId: "1",
          routingOrder: "1",
          tabs: {
            // Anchored to the text "Tenant Signature:" on the document. If the
            // PDF doesn't have that anchor, DocuSign lets the signer place it.
            signHereTabs: [
              {
                anchorString: "Tenant Signature:",
                anchorYOffset: "10",
                anchorUnits: "pixels",
                anchorXOffset: "20",
              },
            ],
            dateSignedTabs: [
              {
                anchorString: "Tenant Signature:",
                anchorYOffset: "10",
                anchorUnits: "pixels",
                anchorXOffset: "200",
              },
            ],
          },
        },
      ],
    },
    status: "sent",
  };

  const res = await fetch(`${baseUrl}/restapi/v2.1/accounts/${accountId}/envelopes`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(envelope),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`DocuSign createEnvelope failed (${res.status}): ${data.errorCode ?? ""} ${data.message ?? ""}`.trim());
  }
  return {
    envelopeId: data.envelopeId,
    status: data.status,
  };
}

/**
 * Fetch envelope status from DocuSign.
 */
export async function getEnvelopeStatus(envelopeId: string): Promise<{ status: string; completedAt?: string }> {
  const { token, accountId, baseUrl } = await getAccessToken();
  const res = await fetch(`${baseUrl}/restapi/v2.1/accounts/${accountId}/envelopes/${envelopeId}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`DocuSign getEnvelope failed (${res.status}): ${data.errorCode ?? ""} ${data.message ?? ""}`.trim());
  }
  return {
    status: data.status,
    completedAt: data.completedDateTime,
  };
}

/**
 * Download the completed envelope's combined signed PDF.
 */
export async function downloadCompletedEnvelope(envelopeId: string): Promise<Buffer> {
  const { token, accountId, baseUrl } = await getAccessToken();
  const res = await fetch(
    `${baseUrl}/restapi/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/combined`,
    { headers: { "Authorization": `Bearer ${token}` } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DocuSign download failed (${res.status}): ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

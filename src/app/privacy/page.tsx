import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — JAM Property Management",
  description:
    "Privacy policy for the JAM Property Management application — what data we collect, who we share it with, and how we protect it.",
};

// Updated whenever a material change is made to the policy. Plaid and
// other reviewers expect to see a visible "last updated" date.
const LAST_UPDATED = "June 4, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--rule)] bg-[var(--brand-navy)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-[var(--brand-gold)] text-[var(--brand-navy)] text-[10px] font-bold tracking-widest shadow-sm group-hover:bg-[var(--brand-gold-soft)] transition-colors">
              JAM
            </span>
            <span className="hidden sm:inline font-serif text-[15px] text-white tracking-tight">
              JAM Property Management
            </span>
          </Link>
          <Link href="/login" className="text-xs uppercase tracking-[0.15em] text-white/70 hover:text-[var(--brand-gold-soft)]">
            Sign in
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="serif text-3xl text-[var(--brand-navy)] dark:text-white mb-2">Privacy Policy</h1>
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted-fg)] mb-8">Last updated: {LAST_UPDATED}</p>

        <section className="prose-sm space-y-6 text-[15px] leading-relaxed">
          <p>
            This Privacy Policy describes how JAM Property Management (&quot;<strong>JAM</strong>,&quot; &quot;<strong>we</strong>,&quot;
            &quot;<strong>our</strong>&quot;) collects, uses, stores, shares, and protects personal information in
            connection with the JAM Property Management web application (the &quot;<strong>Application</strong>&quot;).
            JAM is a privately-held real estate investment partnership operating three multifamily
            rental properties in Oregon. The Application is used by a small, invitation-only group of
            partners, operations staff, and current tenants of those properties.
          </p>

          <h2 className="serif text-xl text-[var(--brand-navy)] dark:text-white mt-8 mb-2">1. Who this policy applies to</h2>
          <p>
            This policy applies to anyone whose personal information is processed through the
            Application, including:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Partners and operations staff</strong> — the named investors and the operations
              manager who log in to administer the portfolio.
            </li>
            <li>
              <strong>Current and former tenants</strong> of properties managed by JAM, whose lease,
              rent, maintenance, and contact information is stored on their behalf.
            </li>
            <li>
              <strong>Vendors and counterparties</strong> whose names, contact details, and invoice
              records appear in connection with maintenance work or property expenses.
            </li>
          </ul>
          <p>
            The Application is <strong>not</strong> a consumer-facing product. Accounts cannot
            self-register; every user is provisioned by the General Partner via individual email
            invitation.
          </p>

          <h2 className="serif text-xl text-[var(--brand-navy)] dark:text-white mt-8 mb-2">2. Information we collect</h2>
          <p>We collect the following categories of personal information:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Account information</strong> — name, email address, and authentication credentials
              for invited users.
            </li>
            <li>
              <strong>Tenant information</strong> — name, email address, phone number, mailing address,
              lease start and end dates, monthly rent, security deposit amount, payment history, and
              maintenance ticket history. Provided by the tenant or entered by JAM on the tenant&apos;s
              behalf.
            </li>
            <li>
              <strong>Lease documents and other uploads</strong> — signed lease PDFs, move-in/move-out
              inspection forms, insurance documents, photos, and similar attachments that authorized
              users upload to the Application.
            </li>
            <li>
              <strong>Financial and bookkeeping data</strong> — property-level operating expenses,
              capital improvements, mortgage balances, partner distributions, and Schedule of Real
              Estate / Personal Financial Statement inputs.
            </li>
            <li>
              <strong>Bank-feed and transaction data</strong> — if a user elects to connect a bank
              account, we receive from Plaid Inc. (&quot;<strong>Plaid</strong>&quot;) the institution name,
              account names and types, last four digits of account numbers, and posted transactions
              (date, amount, description, merchant, category). We do not store full bank account
              numbers or online banking login credentials; those are held by Plaid under their own
              security controls.
            </li>
            <li>
              <strong>Payment data</strong> — if a tenant pays rent through the Application using
              Stripe, Inc. (&quot;<strong>Stripe</strong>&quot;), Stripe processes the payment instrument
              and returns a confirmation record. We store the payment amount, date, status, and
              Stripe&apos;s transaction reference; we do not store card numbers, ACH account numbers, or
              CVCs.
            </li>
            <li>
              <strong>Technical metadata</strong> — IP address, browser type, and timestamps for
              audit-logged sensitive actions (lease creation, deletion, document upload, role
              changes, etc.).
            </li>
          </ul>

          <h2 className="serif text-xl text-[var(--brand-navy)] dark:text-white mt-8 mb-2">3. How we use the information</h2>
          <p>We process this information only for the following purposes:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Operating the rental properties (issuing leases, collecting rent, scheduling maintenance, communicating with tenants and vendors).</li>
            <li>Producing partner-level financial statements, tax documentation, and lender packages.</li>
            <li>Authenticating users and enforcing role-based access controls.</li>
            <li>Sending operational emails (rent reminders, document deliveries, expense alerts).</li>
            <li>Detecting and preventing fraud, abuse, or unauthorized access.</li>
            <li>Complying with applicable Oregon and federal landlord-tenant, tax, and financial-reporting laws.</li>
          </ul>
          <p>
            We do <strong>not</strong> use personal information for advertising, do not sell personal
            information, and do not share it with third parties for marketing.
          </p>

          <h2 className="serif text-xl text-[var(--brand-navy)] dark:text-white mt-8 mb-2">4. Third-party service providers (subprocessors)</h2>
          <p>
            The Application is built on the following subprocessors. Each is bound by their own
            published privacy policy and security commitments. We share with each only the data
            necessary for that service to perform its function.
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Vercel Inc.</strong> — application hosting and content delivery.{" "}
              <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Privacy policy
              </a>
              .
            </li>
            <li>
              <strong>Supabase Inc.</strong> — managed PostgreSQL database, file storage, and
              authentication. Hosted on AWS US-West-2.{" "}
              <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Privacy policy
              </a>
              .
            </li>
            <li>
              <strong>Plaid Inc.</strong> — bank-account connection and transaction retrieval, used
              only when a JAM partner explicitly links a financial institution.{" "}
              <a href="https://plaid.com/legal/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Plaid End User Privacy Policy
              </a>
              .
            </li>
            <li>
              <strong>Stripe, Inc.</strong> — payment processing for tenant rent payments and similar
              charges.{" "}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Privacy policy
              </a>
              .
            </li>
            <li>
              <strong>Resend, Inc.</strong> — transactional email delivery (rent reminders, document
              attachments, alerts).{" "}
              <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Privacy policy
              </a>
              .
            </li>
            <li>
              <strong>Anthropic PBC</strong> — used selectively to assist with parsing of
              property-management documents (e.g., monthly Regency reports). No tenant or banking
              data is sent to Anthropic; document content is processed transiently and not retained
              for training.{" "}
              <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Privacy policy
              </a>
              .
            </li>
          </ul>

          <h2 className="serif text-xl text-[var(--brand-navy)] dark:text-white mt-8 mb-2">5. How we protect the information</h2>
          <p>The Application uses the following controls:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>HTTPS / TLS 1.2+ encryption for all data in transit.</li>
            <li>AES-256 encryption at rest for the database and file storage (managed by Supabase on AWS KMS).</li>
            <li>PostgreSQL row-level security on every production table.</li>
            <li>Role-based access control with separate admin / partner / manager / tenant scopes; principle of least privilege.</li>
            <li>Per-property membership scoping — partners only see properties they are assigned to.</li>
            <li>Invitation-only user provisioning with single-use, time-limited tokens.</li>
            <li>Multi-factor authentication required on administrative accounts (GitHub, Vercel, Supabase, Plaid dashboard).</li>
            <li>Audit logging of sensitive operations.</li>
            <li>Continuous dependency vulnerability scanning via GitHub Dependabot, with patches applied within a defined SLA (critical within 7 days, high within 30 days, medium/low within 90 days).</li>
          </ul>

          <h2 className="serif text-xl text-[var(--brand-navy)] dark:text-white mt-8 mb-2">6. How long we keep information</h2>
          <p>
            We retain personal information for as long as a tenancy, partnership, or vendor
            relationship is active, plus the longer of:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>seven (7) years following termination, to support tax records, lender requests, and Oregon landlord-tenant statutory record-keeping; or</li>
            <li>any longer period required by law.</li>
          </ul>
          <p>
            Bank-feed access tokens are kept only as long as the user keeps the institution
            connected. Disconnecting a bank in the Bank Feeds page revokes the token with Plaid and
            removes it from our database. Transaction history that was already imported is retained
            for bookkeeping continuity unless a deletion request is made.
          </p>

          <h2 className="serif text-xl text-[var(--brand-navy)] dark:text-white mt-8 mb-2">7. Your rights</h2>
          <p>You may request, by emailing the address in section 11:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>A copy of the personal information we hold about you.</li>
            <li>Correction of inaccurate information.</li>
            <li>Deletion of your information, subject to records we are legally required to retain (e.g., signed leases, rent ledgers required for tax and Oregon landlord-tenant compliance).</li>
            <li>Export of your data in a structured, machine-readable format.</li>
            <li>Withdrawal of consent for any optional processing, including disconnection of any linked bank account.</li>
          </ul>
          <p>We will respond to verified requests within thirty (30) days.</p>

          <h2 className="serif text-xl text-[var(--brand-navy)] dark:text-white mt-8 mb-2">8. Children</h2>
          <p>
            The Application is not intended for use by anyone under 18. We do not knowingly collect
            personal information from minors. If a minor&apos;s information appears in a lease (e.g., as
            a household occupant), it is collected and processed on the same basis as other tenancy
            information and is subject to the same retention and security controls.
          </p>

          <h2 className="serif text-xl text-[var(--brand-navy)] dark:text-white mt-8 mb-2">9. International users</h2>
          <p>
            The Application is operated in the United States. Data is stored in the United States
            (Supabase on AWS US-West-2; Vercel US regions). If you access the Application from
            outside the United States, you understand that your information will be transferred to,
            stored in, and processed in the United States.
          </p>

          <h2 className="serif text-xl text-[var(--brand-navy)] dark:text-white mt-8 mb-2">10. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date at the top
            of this page reflects the most recent revision. Material changes will be communicated to
            active users by email at least thirty (30) days before they take effect.
          </p>

          <h2 className="serif text-xl text-[var(--brand-navy)] dark:text-white mt-8 mb-2">11. Contact</h2>
          <p>
            Questions about this Privacy Policy, requests under Section 7, or other privacy concerns
            should be directed to:
          </p>
          <p className="text-sm">
            <strong>Adam Lewis, General Partner</strong>
            <br />
            JAM Property Management
            <br />
            <a href="mailto:adamlewis83@gmail.com" className="text-blue-600 hover:underline">
              adamlewis83@gmail.com
            </a>
          </p>
        </section>

        <footer className="mt-12 pt-6 border-t border-[var(--rule)] text-xs text-[var(--muted-fg)] flex items-center justify-between">
          <span>© {new Date().getUTCFullYear()} JAM Property Management. All rights reserved.</span>
          <Link href="/" className="hover:underline">Return to app →</Link>
        </footer>
      </main>
    </div>
  );
}

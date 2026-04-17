import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { money, isoDate } from "@/lib/money";
import Link from "next/link";
import { PrintButton } from "./print-button";

export default async function LeaseAgreement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lease = await prisma.lease.findUnique({
    where: { id },
    include: { unit: true, tenant: true },
  });
  if (!lease) notFound();

  const t = lease.tenant;
  const u = lease.unit;
  const rent = money(lease.monthlyRent);
  const deposit = money(lease.securityDeposit);
  const start = isoDate(lease.startDate);
  const end = isoDate(lease.endDate);

  return (
    <div className="min-h-screen bg-white print:bg-white">
      <div className="max-w-3xl mx-auto p-8 print:p-0 text-[13px] leading-relaxed text-black">

        <div className="print:hidden mb-6 flex gap-4">
          <Link href={`/leases/${id}`} className="text-sm text-blue-600 hover:underline">← Back to lease</Link>
          <PrintButton />
        </div>

        <h1 className="text-xl font-bold text-center mb-1">RESIDENTIAL LEASE AGREEMENT</h1>
        <p className="text-center text-sm mb-6">State of Oregon — Washington County — Forest Grove</p>

        <p className="mb-4">
          This Residential Lease Agreement (&ldquo;Agreement&rdquo;) is entered into on <U>{start}</U> by and between:
        </p>

        <p className="mb-2"><strong>LANDLORD:</strong> Adam&apos;s Properties (&ldquo;Landlord&rdquo;)</p>
        <p className="mb-4"><strong>TENANT:</strong> {t.firstName} {t.lastName} (&ldquo;Tenant&rdquo;){t.email ? `, Email: ${t.email}` : ""}{t.phone ? `, Phone: ${t.phone}` : ""}</p>

        <Section n={1} title="PREMISES">
          <p>Landlord agrees to lease to Tenant the residential unit located at:</p>
          <p className="mt-2 font-medium">Unit {u.label}, Forest Grove, OR 97116</p>
          <p className="mt-2">
            The premises consists of {u.bedrooms} bedroom(s), {u.bathrooms} bathroom(s){u.sqft ? `, approximately ${u.sqft} square feet` : ""}.
            The premises shall be used exclusively as a private residence for Tenant and authorized occupants only.
          </p>
        </Section>

        <Section n={2} title="TERM">
          <p>
            This lease shall commence on <strong>{start}</strong> and terminate on <strong>{end}</strong>.
            If Tenant remains in possession after the expiration of this lease with Landlord&apos;s consent,
            tenancy shall convert to a month-to-month tenancy under the same terms, subject to
            modification or termination as provided by Oregon law (ORS 90.427).
          </p>
        </Section>

        <Section n={3} title="RENT">
          <p>
            Tenant agrees to pay <strong>{rent}</strong> per month as rent for the premises.
            Rent is due on the <strong>1st day</strong> of each month and shall be considered received when
            payment clears. Rent may be paid by ACH bank transfer, check, or other method approved by Landlord.
          </p>
        </Section>

        <Section n={4} title="LATE FEES (ORS 90.260)">
          <p>
            If rent is not received by the <strong>4th day</strong> of the rental period, a late fee of
            <strong> 5% of the monthly rent</strong> ({money(Number(lease.monthlyRent) * 0.05)}) shall be assessed
            for each 5-day period (or portion thereof) that rent remains delinquent.
            Late fees shall not be deducted from subsequent rent payments to render those payments delinquent.
          </p>
        </Section>

        <Section n={5} title="SECURITY DEPOSIT (ORS 90.300)">
          <p>
            Upon execution of this Agreement, Tenant shall pay a security deposit of <strong>{deposit}</strong>.
            The deposit shall be held in a trust account separate from Landlord&apos;s personal or business funds.
          </p>
          <p className="mt-2">
            Within 31 days after termination of tenancy and delivery of possession, Landlord shall return
            the deposit to Tenant, less any deductions for: (a) unpaid rent; (b) repair of damages caused
            by Tenant beyond ordinary wear and tear; (c) cleaning costs to restore the premises to
            move-in condition; and (d) other charges permitted under ORS 90.300.
          </p>
          <p className="mt-2">
            Landlord shall provide an itemized written accounting of any deductions.
          </p>
        </Section>

        <Section n={6} title="UTILITIES AND SERVICES">
          <p>
            <strong>Landlord provides:</strong> ___________________________<br />
            <strong>Tenant provides:</strong> ___________________________
          </p>
        </Section>

        <Section n={7} title="MAINTENANCE AND REPAIRS">
          <p>
            Landlord shall maintain the premises in a habitable condition as required by ORS 90.320.
            Tenant shall keep the dwelling unit clean and safe, use all electrical, plumbing, sanitary,
            heating, ventilating, and other facilities in a reasonable manner, and promptly notify
            Landlord of any needed repairs or unsafe conditions.
          </p>
          <p className="mt-2">
            Tenant shall not make alterations to the premises without prior written consent of Landlord.
          </p>
        </Section>

        <Section n={8} title="LANDLORD ACCESS (ORS 90.322)">
          <p>
            Landlord shall provide at least <strong>24 hours&apos; advance notice</strong> before entering
            the premises, except in cases of emergency. Notice shall include the reason for entry,
            date and approximate time, and name of the person entering. Entry shall be at reasonable
            times during normal business hours unless otherwise agreed.
          </p>
          <p className="mt-2">
            In an emergency posing a threat of serious damage, Landlord may enter without notice but
            shall provide written notice within 24 hours of entry, including the nature of the emergency.
          </p>
        </Section>

        <Section n={9} title="TERMINATION AND NOTICE">
          <p>
            <strong>Fixed-term:</strong> This lease terminates on {end} without further notice unless renewed in writing.
          </p>
          <p className="mt-2">
            <strong>Month-to-month conversion:</strong> If tenancy converts to month-to-month:
          </p>
          <ul className="list-disc ml-6 mt-1">
            <li>Tenant may terminate with 30 days&apos; written notice.</li>
            <li>Landlord may terminate with 30 days&apos; notice (first year) or 60 days&apos; notice (after first year) per ORS 90.427.</li>
          </ul>
          <p className="mt-2">
            <strong>For cause:</strong> Landlord may terminate for material noncompliance with this Agreement
            per ORS 90.392, providing Tenant notice and opportunity to cure as required by law.
          </p>
        </Section>

        <Section n={10} title="SMOKING POLICY">
          <p>
            Smoking (including e-cigarettes and vaping) is <strong>☐ prohibited on the entire premises</strong> /
            <strong> ☐ permitted only in designated outdoor areas</strong> / <strong>☐ permitted without restriction</strong>.
            <em> (Check one.)</em>
          </p>
        </Section>

        <Section n={11} title="PETS">
          <p>
            <strong>☐ No pets</strong> are permitted without prior written consent. /
            <strong> ☐ Pets permitted</strong> subject to a pet deposit of $______ and the following conditions: ______________________________.
            <em> (Check one.)</em>
          </p>
        </Section>

        <Section n={12} title="SAFETY DEVICES (ORS 90.317, ORS 479.270)">
          <p>
            Landlord shall provide and maintain functional smoke alarms in the premises.
            Landlord shall provide and maintain a functional carbon monoxide alarm where a
            carbon monoxide source exists (gas appliance, fireplace, attached garage, etc.).
            Tenant shall not disable or tamper with safety devices and shall promptly notify
            Landlord of any malfunction.
          </p>
        </Section>

        <Section n={13} title="LEAD-BASED PAINT DISCLOSURE (Pre-1978 Properties)">
          <p>
            <strong>☐ Property was built before 1978.</strong> Landlord has provided the EPA pamphlet
            &ldquo;Protect Your Family from Lead in Your Home&rdquo; and a separate Lead-Based Paint
            Disclosure form, signed by both parties and attached hereto.
          </p>
          <p className="mt-2">
            <strong>☐ Property was built in 1978 or later.</strong> Lead-based paint disclosure is not required.
          </p>
          <p className="mt-1"><em>(Check one.)</em></p>
        </Section>

        <Section n={14} title="FLOOD ZONE DISCLOSURE (ORS 90.228)">
          <p>
            <strong>☐ The premises IS located</strong> in a 100-year flood plain as designated by FEMA. /
            <strong> ☐ The premises IS NOT located</strong> in a designated flood plain.
            <em> (Check one.)</em>
          </p>
        </Section>

        <Section n={15} title="PENDING LEGAL ACTIONS (ORS 90.310)">
          <p>
            Landlord <strong>☐ does</strong> / <strong>☐ does not</strong> have pending foreclosure or other legal
            action that could affect Tenant&apos;s occupancy. <em>(Check one.)</em>
          </p>
        </Section>

        <Section n={16} title="INSURANCE">
          <p>
            Landlord&apos;s insurance does not cover Tenant&apos;s personal property. Tenant is strongly
            encouraged to obtain renter&apos;s insurance to protect personal belongings against loss
            from fire, theft, water damage, and liability claims.
          </p>
        </Section>

        <Section n={17} title="GENERAL PROVISIONS">
          <ol className="list-[lower-alpha] ml-6 space-y-1">
            <li><strong>Governing law:</strong> This Agreement is governed by Oregon Residential Landlord and Tenant Act (ORS Chapter 90).</li>
            <li><strong>Severability:</strong> If any provision is found unenforceable, the remainder of this Agreement shall remain in full force and effect.</li>
            <li><strong>Entire agreement:</strong> This Agreement constitutes the entire understanding between the parties and supersedes all prior negotiations.</li>
            <li><strong>Modifications:</strong> Any changes to this Agreement must be in writing and signed by both parties.</li>
            <li><strong>Quiet enjoyment:</strong> Tenant shall be entitled to quiet enjoyment of the premises, subject to the terms of this Agreement.</li>
            <li><strong>Notices:</strong> All notices shall be in writing and delivered to the addresses below, or as otherwise provided by ORS 90.155.</li>
          </ol>
        </Section>

        <Section n={18} title="ADDITIONAL TERMS">
          <div className="border border-zinc-300 rounded p-3 min-h-[80px]">
            <p className="text-zinc-400 italic">Additional terms, if any:</p>
          </div>
        </Section>

        <div className="mt-10 space-y-8">
          <p className="font-medium">
            By signing below, the parties acknowledge that they have read, understand, and agree
            to all terms and conditions of this Residential Lease Agreement.
          </p>

          <div className="grid grid-cols-2 gap-12 mt-8">
            <div>
              <p className="font-medium mb-6">LANDLORD</p>
              <div className="border-b border-black mb-1 h-8"></div>
              <p className="text-xs">Signature</p>
              <div className="border-b border-black mb-1 h-8 mt-4"></div>
              <p className="text-xs">Printed Name</p>
              <div className="border-b border-black mb-1 h-8 mt-4"></div>
              <p className="text-xs">Date</p>
            </div>
            <div>
              <p className="font-medium mb-6">TENANT</p>
              <div className="border-b border-black mb-1 h-8"></div>
              <p className="text-xs">Signature</p>
              <div className="border-b border-black mb-1 h-8 mt-4"></div>
              <p className="text-xs">Printed Name: {t.firstName} {t.lastName}</p>
              <div className="border-b border-black mb-1 h-8 mt-4"></div>
              <p className="text-xs">Date</p>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-zinc-300 text-xs text-zinc-500">
          <p>
            This lease template is provided for informational purposes and is based on Oregon Revised
            Statutes Chapter 90 as of 2026. It is not a substitute for legal advice. Landlord is
            encouraged to have this agreement reviewed by an Oregon-licensed attorney before use.
          </p>
        </div>

      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="font-bold mb-1">{n}. {title}</h2>
      {children}
    </div>
  );
}

function U({ children }: { children: React.ReactNode }) {
  return <span className="underline">{children}</span>;
}

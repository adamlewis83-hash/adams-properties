-- Enable Row Level Security on every table in the public schema.
-- With RLS on and no policies defined, anon/authenticated PostgREST
-- queries return zero rows. The app is unaffected because Prisma
-- connects as the table owner, which bypasses RLS.

ALTER TABLE "public"."Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Distribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Loan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."LoanPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Unit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Lease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Charge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MaintenanceTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."_PropertyToVendor" ENABLE ROW LEVEL SECURITY;

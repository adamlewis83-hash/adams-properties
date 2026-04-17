-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT DEFAULT 'Forest Grove',
    "state" TEXT DEFAULT 'OR',
    "zip" TEXT,
    "purchasePrice" DECIMAL(12,2),
    "purchaseDate" DATE,
    "currentValue" DECIMAL(12,2),
    "downPayment" DECIMAL(12,2),
    "closingCosts" DECIMAL(12,2),
    "rehabCosts" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "currentBalance" DECIMAL(12,2) NOT NULL,
    "interestRate" DECIMAL(5,3) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "monthlyPayment" DECIMAL(10,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "maturityDate" DATE,
    "loanType" TEXT DEFAULT 'Fixed',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "paidAt" DATE NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "principal" DECIMAL(10,2) NOT NULL,
    "interest" DECIMAL(10,2) NOT NULL,
    "escrow" DECIMAL(10,2),
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id")
);

-- Add propertyId to Unit
ALTER TABLE "Unit" ADD COLUMN "propertyId" TEXT;

-- Add propertyId to Expense
ALTER TABLE "Expense" ADD COLUMN "propertyId" TEXT;

-- CreateIndex
CREATE INDEX "Loan_propertyId_idx" ON "Loan"("propertyId");
CREATE INDEX "LoanPayment_loanId_paidAt_idx" ON "LoanPayment"("loanId", "paidAt");
CREATE INDEX "Unit_propertyId_idx" ON "Unit"("propertyId");
CREATE INDEX "Expense_propertyId_idx" ON "Expense"("propertyId");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

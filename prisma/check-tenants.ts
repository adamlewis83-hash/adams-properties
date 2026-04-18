const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.tenant.count();
  const withEmail = await prisma.tenant.count({ where: { email: { not: null } } });
  const withoutEmail = await prisma.tenant.count({ where: { email: null } });
  const excluding = await prisma.tenant.count({
    where: { email: { not: "historical@aal-properties.local" } },
  });
  console.log("Total tenants:", total);
  console.log("With email:", withEmail);
  console.log("Without email:", withoutEmail);
  console.log("Count matching email != historical (what the page uses):", excluding);
}

main().catch(console.error).finally(() => prisma.$disconnect());

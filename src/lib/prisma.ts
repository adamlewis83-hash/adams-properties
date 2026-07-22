import { PrismaClient } from "@prisma/client";

/**
 * Soft-delete filter. Payment / Expense / Vendor / Asset rows carry a
 * `deletedAt` timestamp; every list/aggregate query on those models is
 * automatically scoped to `deletedAt: null` so deleted rows vanish from
 * the UI, dashboards, analytics, exports, and statements without each
 * call site needing the filter.
 *
 * Escape hatches:
 * - findUnique / findUniqueOrThrow are NOT filtered (direct id lookups
 *   must still find soft-deleted rows so Restore/undo can work).
 * - Any query that explicitly mentions `deletedAt` in its where clause
 *   is left alone (lets the audit/restore surfaces list deleted rows).
 *
 * NOTE: nested relation reads (include/select from a parent model) are
 * not intercepted by Prisma extensions — those call sites carry their
 * own `deletedAt: null` where filters.
 */
const SOFT_DELETE_MODELS = new Set(["Payment", "Expense", "Vendor", "Asset"]);

function makeClient() {
  const base = new PrismaClient();
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (
            model &&
            SOFT_DELETE_MODELS.has(model) &&
            ["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"].includes(operation)
          ) {
            const a = (args ?? {}) as { where?: Record<string, unknown> };
            const where = a.where ?? {};
            if (!("deletedAt" in where)) {
              a.where = { ...where, deletedAt: null };
              return query(a as typeof args);
            }
          }
          return query(args);
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof makeClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedClient };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

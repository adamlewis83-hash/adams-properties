import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";

function plaidEnv(): keyof typeof PlaidEnvironments {
  const v = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
  if (v === "production") return "production";
  if (v === "development") return "development";
  return "sandbox";
}

export function plaidClient() {
  const env = plaidEnv();
  const config = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  });
  return new PlaidApi(config);
}

export const PLAID_PRODUCTS: Products[] = [Products.Transactions];
export const PLAID_COUNTRY_CODES: CountryCode[] = [CountryCode.Us];

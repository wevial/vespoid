import { ConvexError } from "convex/values";

export const VESPOID_OWNER_EMAIL = "ko@kvial.com";

export type VespoidIdentity = {
  tokenIdentifier: string;
  subject: string;
  issuer: string;
  email?: string;
  common_name?: unknown;
};

type AuthContext = {
  auth: {
    getUserIdentity(): Promise<VespoidIdentity | null>;
  };
};

type AuthorizationOptions = {
  ingestionServiceClientId?: string;
};

function configuredIngestionServiceClientId(): string | undefined {
  const clientId = process.env.VESPOID_INGESTION_SERVICE_CLIENT_ID?.trim();
  return clientId || undefined;
}

export function isVespoidIdentityAuthorized(
  identity: VespoidIdentity | null,
  { ingestionServiceClientId = configuredIngestionServiceClientId() }: AuthorizationOptions = {},
): boolean {
  if (identity?.email?.toLowerCase() === VESPOID_OWNER_EMAIL) return true;

  // Cloudflare Access service-token JWTs use common_name for the token's
  // Client ID, not its display name. An unset ID deliberately authorizes no
  // machine identity, so local ingestion fails closed until configured.
  return Boolean(ingestionServiceClientId && identity?.common_name === ingestionServiceClientId);
}

export function assertVespoidIdentity(
  identity: VespoidIdentity | null,
  options?: AuthorizationOptions,
): asserts identity is VespoidIdentity {
  if (!isVespoidIdentityAuthorized(identity, options)) {
    throw new ConvexError("Unauthorized");
  }
}

export async function requireVespoidAuthorization(ctx: AuthContext): Promise<VespoidIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  assertVespoidIdentity(identity);
  return identity;
}

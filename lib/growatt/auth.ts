import "server-only";
import { createClient } from "@/lib/supabase/server";

type AuthClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export type GrowattRouteAccess = "allowed" | "unauthenticated" | "forbidden" | "not_configured";

export async function growattRouteAccess(
  factory: () => Promise<AuthClient | null> = createClient,
  allowedUserId = process.env.GROWATT_ALLOWED_USER_ID?.trim(),
): Promise<GrowattRouteAccess> {
  try {
    const client = await factory();
    if (!client) return "unauthenticated";
    const { data: { user } } = await client.auth.getUser();
    if (!user) return "unauthenticated";
    if (!allowedUserId) return "not_configured";
    return user.id === allowedUserId ? "allowed" : "forbidden";
  } catch {
    return "unauthenticated";
  }
}

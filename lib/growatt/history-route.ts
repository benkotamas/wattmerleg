import "server-only";
import { createClient } from "@/lib/supabase/server";

export type HistoryRouteContext = { access: "allowed"; userId: string; client: NonNullable<Awaited<ReturnType<typeof createClient>>> } | { access: "unauthenticated" } | { access: "forbidden" } | { access: "not_configured" };
export async function growattHistoryRouteContext(factory = createClient, allowedUserId = process.env.GROWATT_ALLOWED_USER_ID?.trim()): Promise<HistoryRouteContext> {
  try { const client = await factory(); if (!client) return { access: "unauthenticated" }; const { data: { user } } = await client.auth.getUser(); if (!user) return { access: "unauthenticated" }; if (!allowedUserId) return { access: "not_configured" }; if (user.id !== allowedUserId) return { access: "forbidden" }; return { access: "allowed", userId: user.id, client }; } catch { return { access: "unauthenticated" }; }
}

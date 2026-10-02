import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./problem-schema";

/** Hard-delete the Auth account; the database FK cascades to Invitee data and usage events. */
export async function deleteInviteeAuthUser(userId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new ApiError(503, "not_configured", "Account deletion is temporarily unavailable");
  }

  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error } = await supabase.auth.admin.deleteUser(userId, false);
  if (error) throw new Error("Could not delete the Invitee's Auth account", { cause: error });
}

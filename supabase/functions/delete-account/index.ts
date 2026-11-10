import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://ahmadzamani031.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const origin = req.headers.get("origin");
  if (origin && origin !== "https://ahmadzamani031.github.io") {
    return json({ error: "Origin not allowed" }, 403);
  }

  try {
    const authorization = req.headers.get("Authorization") || "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken || accessToken === authorization) {
      return json({ error: "Authentication required" }, 401);
    }

    const body = await req.json();
    const password = typeof body.password === "string" ? body.password : "";
    const confirmEmail = typeof body.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";
    if (!password || password.length > 1024 || !confirmEmail) {
      return json({ error: "Password and email confirmation are required" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL") || "";
    // Legacy JWT-based keys remain supported in the current Supabase runtime.
    // They are used only inside this server-side function, never in the browser.
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !publishableKey || !secretKey) {
      console.error("Required Supabase function secrets are unavailable");
      return json({ error: "Account deletion service is not configured" }, 503);
    }

    const authClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sessionUser, error: sessionError } = await authClient.auth.getUser(accessToken);
    if (sessionError || !sessionUser.user) return json({ error: "Session is invalid; sign in again" }, 401);

    const user = sessionUser.user;
    if (!user.email || user.email.trim().toLowerCase() !== confirmEmail) {
      return json({ error: "Confirmation email does not match the signed-in account" }, 400);
    }

    const { data: reauthenticated, error: passwordError } = await authClient.auth.signInWithPassword({ email: user.email, password });
    if (passwordError || !reauthenticated.user || reauthenticated.user.id !== user.id) {
      return json({ error: "Password verification failed" }, 401);
    }

    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: purgeError } = await admin.rpc("forushnameh_purge_user_data", { p_user_id: user.id });
    if (purgeError) {
      console.error("Account data cleanup failed", purgeError.message);
      return json({ error: "Account data could not be safely removed. No account deletion was completed." }, 500);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("Auth account deletion failed after data cleanup", deleteError.message);
      return json({
        error: "Business data was removed, but the login account could not be deleted. Sign in again and retry account deletion.",
        retryable: true,
      }, 500);
    }
    return json({ success: true });
  } catch (error) {
    console.error("Account deletion request failed", error);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});

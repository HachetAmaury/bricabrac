// Edge Function `admin-users`: admin-only user management (create, update, enable/disable).
// Runs with the service role; the key comes from Deno.env and never leaves this function.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const fail = (status: number, error: string) => json(status, { ok: false, error });

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isOptionalBool = (v: unknown): v is boolean | undefined => v === undefined || typeof v === 'boolean';
const isOptionalString = (v: unknown): v is string | undefined => v === undefined || typeof v === 'string';
const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const SELF = 'Impossible de modifier votre propre compte.';
const SHORT_PASSWORD = 'Mot de passe trop court (8 caractères minimum).';
const INVALID = 'Requête invalide.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée.');

    const authHeader = req.headers.get('Authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
    if (!match) return fail(401, 'Non autorisé.');
    const jwt = match[1];

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData?.user) return fail(401, 'Non autorisé.');
    const callerId = userData.user.id;

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('is_admin, disabled')
      .eq('id', callerId)
      .maybeSingle();
    if (profileError || !profile || profile.is_admin !== true || profile.disabled !== false) {
      return fail(403, 'Réservé aux administrateurs.');
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(400, INVALID);
      body = parsed as Record<string, unknown>;
    } catch {
      return fail(400, INVALID);
    }

    switch (body.action) {
      case 'create': {
        const { email, password, displayName, isAdmin } = body;
        if (!isNonEmptyString(email)) return fail(400, 'Adresse e-mail requise.');
        if (typeof password !== 'string' || password.length < 8) return fail(400, SHORT_PASSWORD);
        if (!isNonEmptyString(displayName)) return fail(400, 'Nom requis.');
        if (typeof isAdmin !== 'boolean') return fail(400, INVALID);

        const { data, error } = await admin.auth.admin.createUser({
          email: email.trim(),
          password,
          email_confirm: true,
          user_metadata: { display_name: displayName.trim() },
          app_metadata: { is_admin: isAdmin },
        });
        if (error) return fail(400, error.message);
        return json(200, { ok: true, userId: data.user?.id });
      }

      case 'update': {
        const { userId, displayName, password, isAdmin } = body;
        if (!isNonEmptyString(userId)) return fail(400, INVALID);
        if (!isOptionalString(displayName) || !isOptionalString(password) || !isOptionalBool(isAdmin)) {
          return fail(400, INVALID);
        }
        if (displayName !== undefined && !isNonEmptyString(displayName)) return fail(400, 'Nom requis.');
        if (password !== undefined && password.length < 8) return fail(400, SHORT_PASSWORD);
        if (isAdmin === false && sameId(userId, callerId)) return fail(400, SELF);

        const attrs: Record<string, unknown> = {};
        const profilePatch: Record<string, unknown> = {};
        if (password !== undefined) attrs.password = password;
        if (displayName !== undefined) {
          const name = displayName.trim();
          attrs.user_metadata = { display_name: name };
          profilePatch.display_name = name;
        }
        if (isAdmin !== undefined) {
          attrs.app_metadata = { is_admin: isAdmin };
          profilePatch.is_admin = isAdmin;
        }

        if (Object.keys(attrs).length > 0) {
          const { error } = await admin.auth.admin.updateUserById(userId, attrs);
          if (error) return fail(400, error.message);
        }
        if (Object.keys(profilePatch).length > 0) {
          const { error } = await admin.from('profiles').update(profilePatch).eq('id', userId);
          if (error) return fail(400, error.message);
        }
        return json(200, { ok: true, userId });
      }

      case 'setDisabled': {
        const { userId, disabled } = body;
        if (!isNonEmptyString(userId) || typeof disabled !== 'boolean') return fail(400, INVALID);
        if (sameId(userId, callerId)) return fail(400, SELF);

        const { error } = await admin.auth.admin.updateUserById(userId, {
          ban_duration: disabled ? '876600h' : 'none',
        });
        if (error) return fail(400, error.message);
        const { error: pError } = await admin.from('profiles').update({ disabled }).eq('id', userId);
        if (pError) return fail(400, pError.message);
        return json(200, { ok: true, userId });
      }

      default:
        return fail(400, 'Action inconnue.');
    }
  } catch (e) {
    console.error('[admin-users]', e);
    return fail(500, 'Erreur interne.');
  }
});

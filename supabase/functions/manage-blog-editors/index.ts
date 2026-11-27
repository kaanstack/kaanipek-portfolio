import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const siteUrl = (Deno.env.get("SITE_URL") || "https://kaanipek.net.tr").replace(/\/$/, "");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Sunucu yapılandırması eksik." }, 500);
    }

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Oturum doğrulanamadı." }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || user?.id !== "03347b3f-833f-4ff0-97d0-2dd1e4348b3f") {
      return json({ error: "Bu işlem yalnızca site yöneticisi tarafından yapılabilir." }, 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await req.json();
    const action = body?.action;

    if (action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return json({ error: "Geçerli bir e-posta adresi gir." }, 400);
      }
      if (email === (user.email || "").toLowerCase()) {
        return json({ error: "Yönetici hesabını editör olarak davet edemezsin." }, 400);
      }

      // Reuse an existing Auth account instead of trying to invite the same email twice.
      const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) return json({ error: usersError.message }, 500);
      const existingUser = (usersData.users || []).find((item) =>
        (item.email || "").toLowerCase() === email
      );

      let editorUser = existingUser;
      let inviteSent = false;
      if (!editorUser) {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${siteUrl}/invite-accept.html`,
        });
        if (error) return json({ error: error.message }, 400);
        editorUser = data.user;
        inviteSent = true;
      }

      const { error: roleError } = await admin.from("blog_user_roles").upsert({
        user_id: editorUser.id,
        role: "editor",
        granted_by: user.id,
      }, { onConflict: "user_id" });
      if (roleError) {
        return json({ error: "Editör hesabı bulundu ancak yetki verilemedi: " + roleError.message }, 500);
      }

      return json({
        message: inviteSent
          ? "Davet e-postası gönderildi. Kullanıcı bağlantıdan şifresini belirleyebilir."
          : "Bu e-posta zaten kayıtlı. Mevcut hesap yeniden editör olarak yetkilendirildi; yeni davet gerekmez.",
      });
    }

    if (action === "resend") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return json({ error: "Geçerli bir e-posta adresi gir." }, 400);
      }

      const { data: roles, error: rolesError } = await admin
        .from("blog_user_roles").select("user_id");
      if (rolesError) return json({ error: rolesError.message }, 500);

      const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) return json({ error: usersError.message }, 500);

      const editorIds = new Set((roles || []).map((role) => role.user_id));
      const editor = (usersData.users || []).find((item) =>
        editorIds.has(item.id) && (item.email || "").toLowerCase() === email
      );
      if (!editor) return json({ error: "Bu e-posta adresi editör listesinde bulunamadı." }, 404);

      const mailer = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { error } = await mailer.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/invite-accept.html`,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ message: "Yeni şifre belirleme bağlantısı e-posta adresine gönderildi." });
    }

    if (action === "list") {
      const { data: roles, error: rolesError } = await admin
        .from("blog_user_roles").select("user_id,created_at").order("created_at", { ascending: false });
      if (rolesError) return json({ error: rolesError.message }, 500);

      const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) return json({ error: usersError.message }, 500);

      const users = new Map((usersData.users || []).map((item) => [item.id, item]));
      const editors = (roles || []).map((role) => {
        const account = users.get(role.user_id);
        return {
          userId: role.user_id,
          email: account?.email || "E-posta bulunamadı",
          confirmed: Boolean(account?.email_confirmed_at),
          invitedAt: role.created_at,
        };
      });
      return json({ editors });
    }

    if (action === "revoke") {
      const userId = String(body.userId || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
        return json({ error: "Geçersiz kullanıcı kimliği." }, 400);
      }
      if (userId === user.id) return json({ error: "Yönetici hesabının yetkisini buradan kaldıramazsın." }, 400);
      const { error } = await admin.from("blog_user_roles").delete().eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      return json({ message: "Editör yetkisi kaldırıldı." });
    }

    return json({ error: "Bilinmeyen işlem." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Beklenmeyen sunucu hatası." }, 500);
  }
});

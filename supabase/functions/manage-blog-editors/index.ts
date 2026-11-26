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

      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/invite-accept.html`,
      });
      if (error) return json({ error: error.message }, 400);

      const { error: roleError } = await admin.from("blog_user_roles").upsert({
        user_id: data.user.id,
        role: "editor",
        granted_by: user.id,
      }, { onConflict: "user_id" });
      if (roleError) {
        await admin.auth.admin.deleteUser(data.user.id);
        return json({ error: "Davet oluşturuldu ancak editör yetkisi verilemedi: " + roleError.message }, 500);
      }
      return json({ message: "Davet e-postası gönderildi. Kullanıcı bağlantıdan şifresini belirleyebilir." });
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

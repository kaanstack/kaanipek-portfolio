(() => {
  "use strict";
  const URL = "https://dkhkvpspgniygdqgwtyh.supabase.co";
  const KEY = "sb_publishable_MPa3mW5WwmD3eVt_PI2X2Q_tqVCYhmd";
  const ADMIN_UID = "03347b3f-833f-4ff0-97d0-2dd1e4348b3f";
  document.addEventListener("DOMContentLoaded", async () => {
    const loading = document.getElementById("editorLoading");
    const workspace = document.getElementById("editorWorkspace");
    const client = window.vkiSupabaseClient || (window.supabase?.createClient ? window.supabase.createClient(URL, KEY) : null);
    if (client) window.vkiSupabaseClient = client;
    if (!client) { loading.querySelector("p").textContent = "Giriş servisine ulaşılamadı. Lütfen daha sonra tekrar dene."; return; }
    try {
      const { data: { session }, error } = await client.auth.getSession();
      if (error || !session) { window.location.replace("admin.html"); return; }
      if (session.user.id === ADMIN_UID) { window.location.replace("admin.html"); return; }
      const { data, error: roleError } = await client.from("blog_user_roles")
        .select("role").eq("user_id", session.user.id).maybeSingle();
      if (roleError || data?.role !== "editor") {
        await client.auth.signOut();
        window.location.replace("admin.html");
        return;
      }
      loading.classList.add("hidden");
      workspace.classList.remove("hidden");
    } catch (_) {
      window.location.replace("admin.html");
    }
    document.getElementById("editorLogout").addEventListener("click", async () => {
      await client.auth.signOut();
      window.location.replace("admin.html");
    });
  });
})();

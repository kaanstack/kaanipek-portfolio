(() => {
  "use strict";
  const SUPABASE_URL = "https://dkhkvpspgniygdqgwtyh.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MPa3mW5WwmD3eVt_PI2X2Q_tqVCYhmd";
  const message = document.getElementById("inviteMessage");
  const form = document.getElementById("invitePasswordForm");
  const button = document.getElementById("savePasswordButton");
  const targetEmail = new URLSearchParams(window.location.search).get("email")?.trim().toLowerCase();
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storageKey: "kaanipek-editor-recovery-auth",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: true,
    },
  });
  let verifiedEditorEmail = "";

  const setMessage = (value, isError = false) => {
    message.textContent = value;
    message.classList.toggle("is-error", isError);
  };

  const initialize = async () => {
    if (!targetEmail) {
      setMessage("Bu bağlantı hedef hesabı belirtmiyor. Güvenlik için şifre değişikliği durduruldu; yeni bir bağlantı iste.", true);
      form.hidden = true;
      return;
    }
    const { data, error } = await supabase.auth.getSession();
    const sessionEmail = data.session?.user?.email?.trim().toLowerCase();
    if (error || !data.session || !sessionEmail || sessionEmail !== targetEmail) {
      await supabase.auth.signOut({ scope: "local" });
      setMessage("Bağlantı bu editör hesabına ait değil veya süresi dolmuş. Şifre değiştirilmedi. Doğru hesaba ait yeni bağlantı iste.", true);
      form.hidden = true;
      return;
    }
    verifiedEditorEmail = sessionEmail;
    setMessage("Doğrulanan hesap: " + verifiedEditorEmail);
  };

  initialize();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!verifiedEditorEmail || verifiedEditorEmail !== targetEmail) {
      setMessage("Hesap doğrulanamadı. Şifre değiştirilmedi.", true);
      return;
    }
    const password = document.getElementById("newPassword").value;
    const confirmation = document.getElementById("confirmPassword").value;
    if (password.length < 10) return setMessage("Şifre en az 10 karakter olmalı.", true);
    if (password !== confirmation) return setMessage("Şifreler eşleşmiyor.", true);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || userData.user?.email?.trim().toLowerCase() !== verifiedEditorEmail) {
      setMessage("Oturumun editör hesabıyla eşleşmiyor. Şifre değiştirilmedi.", true);
      return;
    }

    button.disabled = true;
    button.textContent = "Kaydediliyor…";
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage("Şifre belirlenemedi: " + error.message, true);
      button.disabled = false;
      button.textContent = "Şifremi belirle";
      return;
    }
    await supabase.auth.signOut({ scope: "local" });
    form.hidden = true;
    setMessage("Editör hesabının şifresi güncellendi. Şimdi yönetici oturumundan çıkış yapıp editör e-postası ve yeni şifresiyle giriş yapabilirsin.");
  });
})();
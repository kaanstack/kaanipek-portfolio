(() => {
  "use strict";
  const SUPABASE_URL = "https://dkhkvpspgniygdqgwtyh.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MPa3mW5WwmD3eVt_PI2X2Q_tqVCYhmd";
  const message = document.getElementById("inviteMessage");
  const form = document.getElementById("invitePasswordForm");
  const button = document.getElementById("savePasswordButton");
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const setMessage = (value, isError = false) => {
    message.textContent = value;
    message.classList.toggle("is-error", isError);
  };

  supabase.auth.getSession().then(({ data, error }) => {
    if (error || !data.session) {
      setMessage("Davet bağlantısı geçersiz veya süresi dolmuş. Yöneticiden yeni davet istemelisin.", true);
      form.hidden = true;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("newPassword").value;
    const confirmation = document.getElementById("confirmPassword").value;
    if (password.length < 10) return setMessage("Şifre en az 10 karakter olmalı.", true);
    if (password !== confirmation) return setMessage("Şifreler eşleşmiyor.", true);
    button.disabled = true;
    button.textContent = "Kaydediliyor…";
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage("Şifre belirlenemedi: " + error.message, true);
      button.disabled = false;
      button.textContent = "Şifremi belirle";
      return;
    }
    setMessage("Şifren oluşturuldu. Editör paneline yönlendiriliyorsun.");
    window.setTimeout(() => window.location.replace("editor.html"), 1200);
  });
})();

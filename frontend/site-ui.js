(() => {
  "use strict";
  document.addEventListener("DOMContentLoaded", () => {
    const themeButton = document.getElementById("themeToggleBtn");
    let savedTheme = null;
    try { savedTheme = localStorage.getItem("site-theme"); } catch (_) {}
    if (savedTheme === "light") {
      document.body.classList.add("light-theme");
      if (themeButton) themeButton.textContent = "🌙";
    }
    themeButton?.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-theme");
      themeButton.textContent = isLight ? "🌙" : "☀️";
      try { localStorage.setItem("site-theme", isLight ? "light" : "dark"); } catch (_) {}
    });
  });
})();

(() => {
  "use strict";
  const root = document.getElementById("projects-grid");
  if (!root || !window.supabase?.createClient) return;
  const client = window.vkiSupabaseClient || window.supabase.createClient(
    "https://dkhkvpspgniygdqgwtyh.supabase.co",
    "sb_publishable_MPa3mW5WwmD3eVt_PI2X2Q_tqVCYhmd"
  );
  window.vkiSupabaseClient = client;
  const isEnglish = () => document.documentElement.lang === "en";
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  };
  const safeUrl = value => {
    try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; }
    catch (_) { return null; }
  };
  let projects = [];
  function render() {
    root.replaceChildren();
    if (!projects.length) {
      root.append(el("p", "projects-empty", isEnglish() ? "New projects will appear here soon." : "Yeni projeler yakında burada yer alacak."));
      return;
    }
    projects.forEach(project => {
      const card = el("article", "card project-card");
      const top = el("div", "card-top");
      top.append(el("span", "tag-pill", project.category));
      const links = el("div", "project-card-links");
      const live = safeUrl(project.live_url);
      const github = safeUrl(project.github_url);
      if (live) {
        const link = el("a", "card-link", isEnglish() ? "Live ↗" : "Canlı ↗");
        link.href = live; link.target = "_blank"; link.rel = "noopener noreferrer"; links.append(link);
      }
      if (github) {
        const link = el("a", "card-link", "GitHub ↗");
        link.href = github; link.target = "_blank"; link.rel = "noopener noreferrer"; links.append(link);
      }
      top.append(links);
      const title = el("h3", "", isEnglish() ? project.title_en : project.title_tr);
      const description = el("p", "card-desc", isEnglish() ? project.description_en : project.description_tr);
      const tech = el("div", "tech-mini");
      (project.technologies || []).forEach((name, index) => {
        if (index) tech.append(document.createTextNode(" • "));
        tech.append(el("span", "", name));
      });
      card.append(top, title, description, tech);
      root.append(card);
    });
  }
  async function load() {
    const { data, error } = await client.from("portfolio_projects")
      .select("id,title_tr,title_en,description_tr,description_en,category,technologies,github_url,live_url,sort_order")
      .eq("is_published", true).order("sort_order", { ascending: true }).order("created_at", { ascending: false }).limit(60);
    if (error) {
      root.replaceChildren(el("p", "projects-empty", isEnglish() ? "Projects are temporarily unavailable." : "Projeler şu anda yüklenemiyor."));
      return;
    }
    projects = data || [];
    render();
    root.dataset.loaded = "true";
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
  document.querySelectorAll(".lang-btn").forEach(button => button.addEventListener("click", () => {
    if (root.dataset.loaded === "true") render();
  }));
})();
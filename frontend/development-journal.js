(() => {
  "use strict";
  const root = document.getElementById("development-timeline");
  if (!root || !window.supabase?.createClient) return;
  const client = window.supabase.createClient(
    "https://dkhkvpspgniygdqgwtyh.supabase.co",
    "sb_publishable_MPa3mW5WwmD3eVt_PI2X2Q_tqVCYhmd"
  );
  const categories = {
    learning: { tr: "Öğrenme", en: "Learning", icon: "↗" },
    project: { tr: "Proje", en: "Project", icon: "⌘" },
    event: { tr: "Etkinlik", en: "Event", icon: "◎" },
    milestone: { tr: "Kilometre taşı", en: "Milestone", icon: "✦" },
    experience: { tr: "Deneyim", en: "Experience", icon: "▣" }
  };
  const isEnglish = () => document.documentElement.lang === "en";
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  };
  const safeLink = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : null;
    } catch (_) { return null; }
  };
  const formatDate = (value) => {
    const date = new Date(value + "T12:00:00");
    return new Intl.DateTimeFormat(isEnglish() ? "en-GB" : "tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(date);
  };
  function render(entries) {
    root.replaceChildren();
    if (!entries.length) {
      root.append(element("p", "development-empty", isEnglish()
        ? "The journal is ready. New learning notes and milestones will appear here."
        : "Gelişim günlüğü hazır. Yeni öğrenme notları ve kilometre taşları burada görünecek."));
      return;
    }
    const list = element("div", "development-timeline-list");
    entries.forEach(entry => {
      const category = categories[entry.category] || categories.learning;
      const item = element("article", "development-entry");
      const marker = element("span", "development-entry-marker", category.icon);
      marker.setAttribute("aria-hidden", "true");
      const body = element("div", "development-entry-body");
      const meta = element("div", "development-entry-meta");
      meta.append(element("span", "development-entry-category", isEnglish() ? category.en : category.tr));
      meta.append(element("time", "development-entry-date", formatDate(entry.event_date)));
      body.append(meta, element("h3", "development-entry-title", entry.title));
      body.append(element("p", "development-entry-summary", entry.summary));
      if (entry.details) body.append(element("p", "development-entry-details", entry.details));
      const url = entry.link_url ? safeLink(entry.link_url) : null;
      if (url) {
        const link = element("a", "development-entry-link", isEnglish() ? "Explore ↗" : "İncele ↗");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        body.append(link);
      }
      item.append(marker, body);
      list.append(item);
    });
    root.append(list);
  }
  async function load() {
    const { data, error } = await client.from("development_entries")
      .select("id,title,category,summary,details,event_date,link_url")
      .eq("is_published", true).order("event_date", { ascending: false }).order("created_at", { ascending: false }).limit(30);
    if (error) {
      root.replaceChildren(element("p", "development-empty", isEnglish()
        ? "The development journal will be available soon."
        : "Gelişim günlüğü yakında burada olacak."));
      return;
    }
    render(data || []);
  }
  document.addEventListener("DOMContentLoaded", load);
  document.querySelectorAll(".lang-btn").forEach(button => button.addEventListener("click", () => {
    const current = root.dataset.loaded === "true";
    if (current) load();
  }));
  const observer = new MutationObserver(() => {
    if (root.dataset.loaded === "true") load();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  const originalLoad = load;
  async function initialLoad() { await originalLoad(); root.dataset.loaded = "true"; }
  document.addEventListener("DOMContentLoaded", initialLoad, { once: true });
})();

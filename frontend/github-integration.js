(() => {
  "use strict";

  const USERNAME = "kaanstack";
  const API = "https://api.github.com";
  const CACHE_KEY = "vki-github-public-v1";
  const CACHE_TTL = 10 * 60 * 1000;

  const $ = (id) => document.getElementById(id);
  const reposEl = $("github-repos");
  const eventsEl = $("github-events");
  const statsEl = $("github-stats");
  const statusEl = $("github-status");
  if (!reposEl || !eventsEl || !statsEl) return;

  let githubData = null;
  const language = () => document.documentElement.lang === "en" ? "en" : "tr";
  const copy = (tr, en) => language() === "en" ? en : tr;

  function readCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      return cached && Date.now() - cached.savedAt < CACHE_TTL ? cached.data : null;
    } catch (_) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (_) {}
  }

  async function fetchJson(path) {
    const response = await fetch(API + path, {
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!response.ok) throw new Error("GitHub API: " + response.status);
    return response.json();
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function safeRepoUrl(repo) {
    const url = String(repo.html_url || "");
    return /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url) ? url : "https://github.com/" + USERNAME;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(language() === "en" ? "en-GB" : "tr-TR", {
      day: "numeric", month: "short", year: "numeric"
    }).format(date);
  }

  function renderStats(profile, repos) {
    const languages = new Set(repos.map((repo) => repo.language).filter(Boolean));
    const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentlyUpdated = repos.filter((repo) => repo.pushed_at && new Date(repo.pushed_at).getTime() >= recentCutoff).length;
    const items = [
      [profile.public_repos ?? repos.length, copy("Herkese açık depo", "Public repositories")],
      [languages.size, copy("Kullanılan dil", "Languages used")],
      [recentlyUpdated, copy("Son 30 günde güncellenen", "Updated in the last 30 days")]
    ];
    statsEl.replaceChildren();
    items.forEach(([value, label]) => {
      const card = makeElement("div", "github-stat");
      card.append(makeElement("span", "github-stat-value", value), makeElement("span", "github-stat-label", label));
      statsEl.appendChild(card);
    });
  }

  function renderRepos(repos) {
    reposEl.replaceChildren();
    const visibleRepos = repos.filter((repo) => !repo.fork && !repo.archived).slice(0, 6);
    if (!visibleRepos.length) {
      reposEl.appendChild(makeElement("p", "github-empty", copy("Henüz herkese açık depo bulunmuyor.", "No public repositories are available yet.")));
      return;
    }

    visibleRepos.forEach((repo) => {
      const card = makeElement("article", "github-repo-card");
      const top = makeElement("div", "github-repo-top");
      const title = makeElement("a", "github-repo-name", repo.name);
      title.href = safeRepoUrl(repo);
      title.target = "_blank";
      title.rel = "noopener noreferrer";
      top.appendChild(title);
      top.appendChild(makeElement("span", "github-repo-visibility", copy("Herkese açık", "Public")));
      card.append(top);
      card.appendChild(makeElement("p", "github-repo-description",
        repo.description || copy("Bu depo için henüz açıklama eklenmemiş.", "No description has been added to this repository yet.")));

      const meta = makeElement("div", "github-repo-meta");
      if (repo.language) meta.appendChild(makeElement("span", "github-meta-item github-language", repo.language));
      meta.appendChild(makeElement("span", "github-meta-item", "★ " + (repo.stargazers_count || 0)));
      meta.appendChild(makeElement("span", "github-meta-item", "⑂ " + (repo.forks_count || 0)));
      card.appendChild(meta);

      const footer = makeElement("div", "github-repo-footer");
      footer.appendChild(makeElement("span", "", copy("Son güncelleme", "Updated") + ": " + formatDate(repo.pushed_at)));
      const link = makeElement("a", "", copy("Depoyu incele", "View repository") + " ↗");
      link.href = safeRepoUrl(repo);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      footer.appendChild(link);
      card.appendChild(footer);
      reposEl.appendChild(card);
    });
  }

  function eventDescription(event) {
    const payload = event.payload || {};
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    switch (event.type) {
      case "PushEvent":
        return commits.length
          ? copy(commits.length + " commit gönderildi", commits.length + " commit" + (commits.length === 1 ? " pushed" : "s pushed"))
          : copy("Kod güncellemesi gönderildi", "Code update pushed");
      case "CreateEvent":
        return copy((payload.ref_type || "öğe") + " oluşturuldu", (payload.ref_type || "item") + " created");
      case "PullRequestEvent":
        return copy("Pull request " + (payload.action || "güncellendi"), "Pull request " + (payload.action || "updated"));
      case "IssuesEvent":
        return copy("Issue " + (payload.action || "güncellendi"), "Issue " + (payload.action || "updated"));
      case "IssueCommentEvent":
        return copy("Bir issue üzerinde yorum yapıldı", "Commented on an issue");
      case "WatchEvent":
        return copy("Depoya yıldız verildi", "Starred a repository");
      case "ForkEvent":
        return copy("Depo fork edildi", "Repository forked");
      case "ReleaseEvent":
        return copy("Yeni sürüm yayınlandı", "Released a new version");
      case "PublicEvent":
        return copy("Depo herkese açık hâle getirildi", "Made a repository public");
      default:
        return copy("GitHub üzerinde etkinlik", "GitHub activity");
    }
  }

  function renderEvents(events) {
    eventsEl.replaceChildren();
    const visibleEvents = events.filter((event) => event.repo?.name).slice(0, 6);
    if (!visibleEvents.length) {
      eventsEl.appendChild(makeElement("p", "github-empty", copy("Görüntülenecek yeni herkese açık aktivite yok.", "No recent public activity to display.")));
      return;
    }

    visibleEvents.forEach((event) => {
      const item = makeElement("article", "github-event");
      const marker = makeElement("span", "github-event-marker", "↗");
      marker.setAttribute("aria-hidden", "true");
      const body = makeElement("div", "github-event-body");
      const repoName = String(event.repo.name);
      const repoLink = makeElement("a", "github-event-repo", repoName);
      if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoName)) {
        repoLink.href = "https://github.com/" + repoName;
      } else {
        repoLink.href = "https://github.com/" + USERNAME;
      }
      repoLink.target = "_blank";
      repoLink.rel = "noopener noreferrer";
      body.appendChild(repoLink);
      body.appendChild(makeElement("p", "github-event-description", eventDescription(event)));
      if (event.type === "PushEvent" && event.payload?.commits?.[0]?.message) {
        body.appendChild(makeElement("p", "github-event-commit", event.payload.commits[0].message.split("\n")[0].slice(0, 120)));
      }
      body.appendChild(makeElement("time", "github-event-date", formatDate(event.created_at)));
      item.append(marker, body);
      eventsEl.appendChild(item);
    });
  }

  function render(data) {
    const repos = Array.isArray(data.repos) ? data.repos : [];
    const events = Array.isArray(data.events) ? data.events : [];
    renderStats(data.profile || {}, repos);
    renderRepos(repos);
    renderEvents(events);
  }

  async function init() {
    const cached = readCache();
    if (cached) {
      githubData = cached;
      render(cached);
    }

    try {
      const [profile, repos, events] = await Promise.all([
        fetchJson("/users/" + USERNAME),
        fetchJson("/users/" + USERNAME + "/repos?sort=updated&per_page=100&type=owner"),
        fetchJson("/users/" + USERNAME + "/events/public?per_page=10")
      ]);
      githubData = { profile, repos, events };
      writeCache(githubData);
      render(githubData);
      if (statusEl) statusEl.textContent = "";
    } catch (_) {
      if (!githubData) {
        reposEl.replaceChildren(makeElement("p", "github-empty", copy(
          "GitHub verileri şu anda yüklenemiyor. Profilimi doğrudan ziyaret edebilirsin.",
          "GitHub data is temporarily unavailable. You can visit my profile directly."
        )));
        eventsEl.replaceChildren(makeElement("p", "github-empty", copy(
          "Son aktiviteler şu anda alınamıyor.",
          "Recent activity is currently unavailable."
        )));
        if (statusEl) statusEl.textContent = copy("Canlı veriler alınamadı; lütfen daha sonra tekrar dene.", "Live data could not be loaded; please try again later.");
      } else if (statusEl) {
        statusEl.textContent = copy("Gösterilen bilgiler son başarılı yüklemeden alınmıştır.", "Showing data from the last successful load.");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.addEventListener("click", () => {
      if (githubData) render(githubData);
    });
  });
})();

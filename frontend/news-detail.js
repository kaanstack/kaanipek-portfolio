(() => {
  const CACHE_KEY = "vki_tech_radar_cache_v1";
  const root = document.getElementById("newsDetail");
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const safeText = (value = "") => String(value).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  const categoryOf = (story) => {
    const text = `${story.title || ""} ${story.text || ""} ${story.url || ""}`.toLowerCase();
    if (/openai|chatgpt|claude|anthropic|gemini|llm|artificial intelligence|\bai\b|machine learning|deep learning|neural| yapay zek/.test(text)) return "Yapay Zekâ";
    if (/security|cyber|vulnerability|zero.day|malware|ransomware|exploit|cve-|siber güvenlik/.test(text)) return "Siber Güvenlik";
    if (/gpu|cpu|processor|chip|semiconductor|nvidia|amd|intel|arm |hardware|donanım/.test(text)) return "Donanım";
    if (/aws|azure|google cloud|kubernetes|docker|devops|cloud|serverless|infrastructure|linux/.test(text)) return "Bulut & DevOps";
    if (/github|gitlab|programming|developer|javascript|python|rust|database|framework|software|open.source| yazılım/.test(text)) return "Yazılım";
    return "Diğer";
  };
  const addText = (parent, tag, value, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    parent.appendChild(node);
    return node;
  };
  async function load() {
    if (!/^\d+$/.test(id || "")) throw new Error("Geçersiz haber bağlantısı.");
    let story = null;
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      story = cache?.stories?.find((item) => String(item.id) === id) || null;
    } catch {}
    if (!story) {
      const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (!response.ok) throw new Error("Haber kaynağına ulaşılamadı.");
      story = await response.json();
    }
    if (!story || !story.title) throw new Error("Haber bulunamadı veya yayından kaldırılmış.");
    const title = story.displayTitle || story.title;
    const url = story.url || `https://news.ycombinator.com/item?id=${id}`;
    let domain = "news.ycombinator.com";
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    document.title = `${title} | Tech Radar`;
    const badge = addText(root, "span", categoryOf(story), "news-category");
    addText(root, "h1", title);
    const meta = document.createElement("div");
    meta.className = "news-detail-meta";
    [domain, story.by ? `Yazar: ${story.by}` : "", `▲ ${story.score || 0} puan`, `💬 ${story.descendants || 0} yorum`, story.time ? new Date(story.time * 1000).toLocaleString("tr-TR") : ""].filter(Boolean).forEach((value) => addText(meta, "span", value));
    root.appendChild(meta);

    const copy = document.createElement("div");
    copy.className = "news-detail-copy";
    addText(copy, "h2", "Gelişmenin özeti");
    if (story.text) {
      story.text.split(/\n+/).map(safeText).filter(Boolean).forEach((paragraph) => addText(copy, "p", paragraph));
    } else {
      addText(copy, "p", `Bu gelişme Hacker News topluluğunda ${story.descendants || 0} yorum ve ${story.score || 0} puanla paylaşıldı. Bu sayfada doğrulanabilir kaynak bilgisi ve topluluk tartışması sunuluyor; yayıncı makalesinin içeriği burada yeniden üretilmiyor.`);
    }
    root.appendChild(copy);

    const commentsSection = document.createElement("section");
    commentsSection.className = "news-detail-section";
    addText(commentsSection, "h2", "Topluluk tartışmasından");
    const commentIds = Array.isArray(story.kids) ? story.kids.slice(0, 3) : [];
    if (commentIds.length) {
      const comments = await Promise.all(commentIds.map(async (commentId) => {
        try {
          const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${commentId}.json`);
          return response.ok ? response.json() : null;
        } catch { return null; }
      }));
      comments.filter((comment) => comment?.text && !comment.deleted).forEach((comment) => {
        const block = addText(commentsSection, "p", safeText(comment.text), "news-comment");
        if (comment.by) block.append(document.createTextNode(` — ${comment.by}`));
      });
    } else {
      addText(commentsSection, "p", "Bu haber için henüz görüntülenebilir yorum bulunmuyor.", "news-comment");
    }
    root.appendChild(commentsSection);

    const actions = document.createElement("div");
    actions.className = "news-detail-actions";
    const source = document.createElement("a");
    source.className = "btn btn-primary";
    source.href = url;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "Orijinal kaynağı ziyaret et ↗";
    actions.appendChild(source);
    const discussion = document.createElement("a");
    discussion.className = "btn btn-secondary";
    discussion.href = `https://news.ycombinator.com/item?id=${id}`;
    discussion.target = "_blank";
    discussion.rel = "noopener noreferrer";
    discussion.textContent = "Hacker News tartışması ↗";
    actions.appendChild(discussion);
    root.appendChild(actions);
  }
  load().catch((error) => {
    root.innerHTML = "";
    addText(root, "h1", "Haber yüklenemedi");
    addText(root, "p", error.message, "news-detail-loading");
    const back = document.createElement("a");
    back.href = "/#news";
    back.className = "btn btn-secondary";
    back.textContent = "Tech Radar'a dön";
    root.appendChild(back);
  });
})();
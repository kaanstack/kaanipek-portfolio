(() => {
  const CACHE_KEY = "vki_tech_radar_cache_v1";
  const TRANSLATION_PREFIX = "vki_news_tr_";
  const root = document.getElementById("newsDetail");
  const params = new URLSearchParams(location.search);
  const id = params.get("id");

  const safeText = (value = "") => String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/gi, "/")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();

  const categoryOf = (story) => {
    const text = `${story.title || ""} ${story.text || ""} ${story.url || ""}`.toLowerCase();
    if (/openai|chatgpt|claude|anthropic|gemini|llm|artificial intelligence|\\bai\\b|machine learning|deep learning|neural|yapay zek/.test(text)) return "Yapay Zekâ";
    if (/security|cyber|vulnerability|zero.day|malware|ransomware|exploit|cve-|siber güvenlik/.test(text)) return "Siber Güvenlik";
    if (/gpu|cpu|processor|chip|semiconductor|nvidia|amd|intel|arm |hardware|donanım/.test(text)) return "Donanım";
    if (/aws|azure|google cloud|kubernetes|docker|devops|cloud|serverless|infrastructure|linux/.test(text)) return "Bulut & DevOps";
    if (/github|gitlab|programming|developer|javascript|python|rust|database|framework|software|open.source|yazılım/.test(text)) return "Yazılım";
    return "Diğer";
  };

  const addText = (parent, tag, value, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    parent.appendChild(node);
    return node;
  };

  // Reject obvious profanity accidentally introduced by low-quality machine translations.
  // Normalize punctuation/diacritics so variants such as "s*ktir" are caught too.
  function hasUnsafeTranslation(value) {
    const normalized = safeText(value).toLocaleLowerCase("tr-TR")
      .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
      .replace(/ı/g, "i");
    const compact = normalized.replace(/[^a-z0-9]+/g, " ").trim();
    const blockedWords = new Set([
      "siktir", "siktirgit", "siktirgitmek", "sikerim", "sikiyorum", "siktim",
      "hasiktir", "hasiktir", "amk", "aq", "orospu", "pic", "yarrak", "gotveren"
    ]);
    return compact.split(/\\s+/).some((word) => blockedWords.has(word));
  }

  async function translateToTurkish(value) {
    const original = safeText(value);
    if (!original || !/[a-zA-Z]/.test(original)) return original;
    const cacheKey = TRANSLATION_PREFIX + original;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached && !hasUnsafeTranslation(cached)) return cached;
      if (cached) localStorage.removeItem(cacheKey);
    } catch {}

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const endpoint = "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(original) + "&langpair=en|tr&de=iletisim@kaanipek.net.tr";
      const response = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return original;
      const data = await response.json();
      const translated = safeText(data?.responseData?.translatedText || "");
      const status = String(data?.responseStatus || "");
      if (!translated || status !== "200" || /used all available free translations|mymemory warning|next available in/i.test(translated)) return original;
      if (hasUnsafeTranslation(translated)) return original;
      try { localStorage.setItem(cacheKey, translated); } catch {}
      return translated;
    } catch {
      return original;
    }
  }

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

    const translatedTitle = await translateToTurkish(story.title);
    const title = translatedTitle !== safeText(story.title) ? translatedTitle : (story.displayTitle || translatedTitle);
    const url = story.url || `https://news.ycombinator.com/item?id=${id}`;
    let domain = "news.ycombinator.com";
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}

    document.title = `${title} | Tech Radar`;
    addText(root, "span", categoryOf(story), "news-category");
    addText(root, "h1", title);

    const meta = document.createElement("div");
    meta.className = "news-detail-meta";
    [domain, story.by ? `Yazar: ${story.by}` : "", `▲ ${story.score || 0} puan`, `💬 ${story.descendants || 0} yorum`, story.time ? new Date(story.time * 1000).toLocaleString("tr-TR") : ""]
      .filter(Boolean).forEach((value) => addText(meta, "span", value));
    root.appendChild(meta);

    const summary = document.createElement("section");
    summary.className = "news-detail-copy";
    addText(summary, "h2", "Gelişmenin özeti");
    if (story.text) {
      const translatedText = await translateToTurkish(story.text);
      translatedText.split(/\n+/).map(safeText).filter(Boolean)
        .forEach((paragraph) => addText(summary, "p", paragraph));
    } else {
      addText(summary, "p", `“${title}” başlıklı gelişme, ${domain} kaynağında yayımlandı ve Hacker News topluluğunda tartışmaya açıldı. Bu sayfa başlığı ve topluluk tepkilerini Türkçe sunar; yayıncının makalesinin tam metnini veya doğrulanmamış bir özeti üretmez.`);
      addText(summary, "p", "Not: Yayıncı makalesinin içeriğini de Türkçe özetleyebilmek için ilgili kaynağın metnine erişim gerekir. Bu bağlantıda şu an yalnızca başlık ve topluluk verileri doğrulanabiliyor.", "news-summary-note");
    }
    root.appendChild(summary);

    const commentsSection = document.createElement("section");
    commentsSection.className = "news-detail-section";
    addText(commentsSection, "h2", "Topluluk tartışmasından");
    addText(commentsSection, "p", "Yorumlar Türkçeye çevrilmiştir; anlam farklılıkları olabilir.", "news-summary-note");

    const commentIds = Array.isArray(story.kids) ? story.kids.slice(0, 3) : [];
    if (commentIds.length) {
      const comments = await Promise.all(commentIds.map(async (commentId) => {
        try {
          const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${commentId}.json`);
          return response.ok ? response.json() : null;
        } catch { return null; }
      }));

      const visibleComments = comments.filter((comment) => comment?.text && !comment.deleted && !comment.dead);
      for (const comment of visibleComments) {
        const translatedComment = await translateToTurkish(comment.text);
        const block = addText(commentsSection, "p", translatedComment || safeText(comment.text), "news-comment");
        if (comment.by) block.append(document.createTextNode(` — ${comment.by}`));
      }
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

let currentLang = 'tr';

async function translateToTurkish(text) {
    if (!text) return "";

    const cacheKey = `vki_hn_tr_${text}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|tr&de=iletisim@kaanipek.net.tr`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            return text;
        }

        const data = await response.json();
        const translated = data?.responseData?.translatedText || "";
        const status = String(data?.responseStatus || "");
        const isQuotaOrRateLimit =
            status === "429" ||
            /mymemory\s+warning/i.test(translated) ||
            /used all available free translations/i.test(translated) ||
            /next available in/i.test(translated);

        if (!translated || isQuotaOrRateLimit) {
            return text;
        }

        localStorage.setItem(cacheKey, translated);
        return translated;
    } catch (error) {
        return text;
    }
}

async function renderTechFeed(containerSelector, limit = 5) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    try {
        const topIdsRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
        if (!topIdsRes.ok) throw new Error("Hacker News topstories alınamadı");

        const topIds = await topIdsRes.json();
        const selectedIds = Array.isArray(topIds) ? topIds.slice(0, limit) : [];

        container.innerHTML = "";

        for (let i = 0; i < selectedIds.length; i++) {
            try {
                const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${selectedIds[i]}.json`);
                if (!itemRes.ok) continue;

                const item = await itemRes.json();
                if (!item || !item.title) continue;

                const displayTitle = await translateToTurkish(item.title);
                const articleUrl = item.url || `https://news.ycombinator.com/item?id=${item.id}`;
                const hostName = (() => {
                    try {
                        return new URL(articleUrl).hostname.replace(/^www\./, "");
                    } catch {
                        return "news.ycombinator.com";
                    }
                })();

                const card = document.createElement("article");
                card.className = "news-card";
                card.innerHTML = `
                    <div>
                        <h3 class="news-card-title">${i + 1}. ${escapeHtml(displayTitle)}</h3>
                        <div class="news-card-meta">
                            <span>${escapeHtml(hostName)}</span>
                            <span>▲ ${item.score ?? 0} puan</span>
                            <span>💬 ${item.descendants ?? 0} yorum</span>
                        </div>
                    </div>
                    <a class="news-read-hint" href="${escapeHtml(articleUrl)}" target="_blank" rel="noopener noreferrer">Detayı Oku →</a>
                `;

                container.appendChild(card);
            } catch (itemError) {
                continue;
            }
        }
    } catch (feedError) {
        container.innerHTML = `<p class="feed-error">Gündem akışı şu an yüklenemedi.</p>`;
    }
}

function escapeHtml(str = "") {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function openNewsModal(story) {
    if (!story) return;
    const modal = document.getElementById('newsModal');
    document.getElementById('modalTitle').textContent = currentLang === 'tr' ? story.trTitle : story.enTitle;
    document.getElementById('modalMeta').textContent = currentLang === 'tr'
        ? `Kaynak: ${story.domain} | Yazar: ${story.author} | ▲ ${story.score} puan • 💬 ${story.comments} yorum`
        : `Source: ${story.domain} | Author: ${story.author} | ▲ ${story.score} points • 💬 ${story.comments} comments`;
    document.getElementById('modalBody').textContent = currentLang === 'tr' ? story.trSummary : story.enSummary;
    document.getElementById('modalExternalLink').href = story.url;

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function closeNewsModal() {
    const modal = document.getElementById('newsModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
}

function updateCvModalSource() {
    const pdfFile = currentLang === 'tr' ? 'CV_TR.pdf' : 'CV_EN.pdf';
    const frame = document.getElementById('cvPdfFrame');
    const dlLink = document.getElementById('cvDownloadLink');
    if (frame) frame.src = pdfFile;
    if (dlLink) dlLink.href = pdfFile;
}

function openCvModal() {
    updateCvModalSource();
    const modal = document.getElementById('cvModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function closeCvModal() {
    const modal = document.getElementById('cvModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
}

function setLanguage(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    document.querySelectorAll('[data-tr][data-en]').forEach(el => {
        el.textContent = el.getAttribute(`data-${lang}`);
    });

    updateCvModalSource();
}

document.addEventListener('DOMContentLoaded', () => {
    // Mobil gezinme menüsü
    const menuToggle = document.getElementById('menuToggleBtn');
    const primaryNav = document.getElementById('primaryNav');
    menuToggle?.addEventListener('click', () => {
        const isOpen = primaryNav?.classList.toggle('is-open') ?? false;
        menuToggle.setAttribute('aria-expanded', String(isOpen));
        menuToggle.setAttribute('aria-label', isOpen ? 'Menüyü Kapat' : 'Menüyü Aç');
    });
    primaryNav?.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            primaryNav.classList.remove('is-open');
            menuToggle?.setAttribute('aria-expanded', 'false');
            menuToggle?.setAttribute('aria-label', 'Menüyü Aç');
        });
    });

    // Dil Seçimi
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
    });

    // Tema Seçimi (Light / Dark)
    const themeBtn = document.getElementById('themeToggleBtn');
    const savedTheme = localStorage.getItem('site-theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        if (themeBtn) themeBtn.textContent = '🌙';
    }
    themeBtn?.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-theme');
        themeBtn.textContent = isLight ? '🌙' : '☀️';
        localStorage.setItem('site-theme', isLight ? 'light' : 'dark');
    });

    // E-posta Kopyalama
    const copyBtn = document.getElementById('copyEmailBtn');
    const toast = document.getElementById('copyToast');
    if (copyBtn && toast) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard?.writeText('iletisim@kaanipek.net.tr');
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2500);
        });
    }

    // Haber Modal Kontrolleri
    document.getElementById('closeModalBtn')?.addEventListener('click', closeNewsModal);
    document.getElementById('modalDismissBtn')?.addEventListener('click', closeNewsModal);
    document.getElementById('newsModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'newsModal') closeNewsModal();
    });

    // CV Modal Kontrolleri
    document.getElementById('openCvBtn')?.addEventListener('click', openCvModal);
    document.getElementById('closeCvModalBtn')?.addEventListener('click', closeCvModal);
    document.getElementById('dismissCvModalBtn')?.addEventListener('click', closeCvModal);
    document.getElementById('cvModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'cvModal') closeCvModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeNewsModal();
            closeCvModal();
        }
    });

    // DevOps Ticket Form Gönderimi (Netlify Forms AJAX)
    const ticketForm = document.getElementById('ticketForm');
    const successBox = document.getElementById('ticketSuccessBox');
    const ticketBadge = document.getElementById('generatedTicketBadge');
    const ticketText = document.getElementById('ticketSuccessText');
    const hiddenIdInput = document.getElementById('hiddenTicketId');

    ticketForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const randomCode = Math.floor(100 + Math.random() * 900);
        const ticketNumber = `#VKI-2026-${randomCode}`;
        if (hiddenIdInput) hiddenIdInput.value = ticketNumber;

        const formData = new FormData(ticketForm);
        try {
            await fetch('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(formData).toString()
            });
        } catch {
            // Yerel testte ağ hatası olursa yine onay ekranını göster
        }

        ticketBadge.textContent = ticketNumber;
        ticketText.textContent = currentLang === 'tr'
            ? `Talebiniz ${ticketNumber} takip numarasıyla oluşturuldu ve iletisim@kaanipek.net.tr adresine yönlendirildi. En kısa sürede dönüş yapılacaktır.`
            : `Your request has been logged under ${ticketNumber} and routed to iletisim@kaanipek.net.tr. You will receive a response shortly.`;

        ticketForm.style.display = 'none';
        successBox.style.display = 'block';
    });

    document.getElementById('newTicketBtn')?.addEventListener('click', () => {
        ticketForm.reset();
        successBox.style.display = 'none';
        ticketForm.style.display = 'flex';
    });

    renderTechFeed("#hn-news-list");
});

async function initBlogPage() {
  const listEl = document.getElementById("blog-list");
  const detailEl = document.getElementById("blog-detail");
  const filtersEl = document.getElementById("blog-filters");
  const formPanel = document.getElementById("blog-form-panel");
  const postForm = document.getElementById("blog-post-form");
  const statusEl = document.getElementById("blog-status");
  const storageKey = "vki_blog_posts";
  if (!listEl || !detailEl || !filtersEl || !formPanel || !postForm || !statusEl) return;

  const addButton = document.getElementById("newPostToggle");
  const cancelButton = document.getElementById("cancelPostForm");
  const copyButton = document.getElementById("copyPostsJson");
  const categorySelect = document.getElementById("postCategory");
  const customCategoryInput = document.getElementById("customPostCategory");
  const titleInput = document.getElementById("postTitle");
  const readTimeInput = document.getElementById("postReadTime");
  const summaryInput = document.getElementById("postSummary");
  const contentInput = document.getElementById("postContent");

  let basePosts = [];
  let localPosts = [];
  let posts = [];
  let activeCategory = "Tümü";

  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", isError);
  }

  function createSlug(value) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function normalizePost(post) {
    if (!post || typeof post !== "object" || typeof post.title !== "string") return null;
    const slug = typeof post.slug === "string" && post.slug ? post.slug : createSlug(post.title);
    return { ...post, slug: slug || "yazi" };
  }

  function mergePosts(...sources) {
    const merged = new Map();
    sources.flat().forEach((postData) => {
      const post = normalizePost(postData);
      if (post && !merged.has(post.slug)) merged.set(post.slug, post);
    });
    return [...merged.values()];
  }

  function renderFilters() {
    const categories = ["Tümü", ...new Set(posts.map((post) => post.category).filter(Boolean))];
    filtersEl.innerHTML = "";
    categories.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-btn ${category === activeCategory ? "active" : ""}`;
      button.textContent = category;
      button.addEventListener("click", () => {
        activeCategory = category;
        detailEl.classList.add("hidden");
        detailEl.innerHTML = "";
        renderFilters();
        renderList();
      });
      filtersEl.appendChild(button);
    });
  }

  function openPost(post) {
    const paragraphs = Array.isArray(post.content) ? post.content : [];
    detailEl.classList.remove("hidden");
    detailEl.innerHTML = `
      <button type="button" id="back-to-list" class="back-btn">← Tüm Yazılara Dön</button>
      <div class="blog-meta">
        <span>${escapeHtml(post.category || "")}</span>
        <span>${escapeHtml(post.date || "")}</span>
        <span>${escapeHtml(post.readTime || "")}</span>
      </div>
      <h2>${escapeHtml(post.title)}</h2>
      ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
    `;
    document.getElementById("back-to-list")?.addEventListener("click", () => {
      detailEl.classList.add("hidden");
      detailEl.innerHTML = "";
    });
    detailEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderList() {
    const filtered = activeCategory === "Tümü"
      ? posts
      : posts.filter((post) => post.category === activeCategory);

    listEl.innerHTML = "";
    if (!filtered.length) {
      listEl.innerHTML = "<p>Bu kategoride henüz yazı yok.</p>";
      return;
    }

    filtered.forEach((post) => {
      const card = document.createElement("article");
      card.className = "blog-card";
      card.innerHTML = `
        <div class="blog-meta">
          <span>${escapeHtml(post.category || "")}</span>
          <span>${escapeHtml(post.date || "")}</span>
          <span>${escapeHtml(post.readTime || "")}</span>
        </div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.summary || "")}</p>
        <button type="button" class="read-btn">Yazıyı Oku →</button>
      `;
      card.querySelector(".read-btn")?.addEventListener("click", () => openPost(post));
      listEl.appendChild(card);
    });
  }

  function updateCustomCategory() {
    const isCustom = categorySelect.value === "custom";
    customCategoryInput.classList.toggle("hidden", !isCustom);
    customCategoryInput.disabled = !isCustom;
    customCategoryInput.required = isCustom;
    if (isCustom) customCategoryInput.focus();
  }

  function closeForm() {
    formPanel.classList.add("hidden");
    addButton.setAttribute("aria-expanded", "false");
    postForm.reset();
    updateCustomCategory();
  }

  function copyTextFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    let copied = false;
    try {
      textarea.select();
      copied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }
    if (!copied) throw new Error("Pano kopyalama başarısız");
  }

  async function copyPostsJson() {
    const output = JSON.stringify(mergePosts(basePosts, localPosts), null, 2);
    try {
      await navigator.clipboard.writeText(output);
    } catch (clipboardError) {
      try {
        copyTextFallback(output);
      } catch (fallbackError) {
        setStatus("JSON panoya kopyalanamadı. Yazılar tarayıcıda kayıtlı kalır.", true);
        return;
      }
    }
    setStatus("Birleştirilmiş JSON panoya kopyalandı.");
  }

  addButton.addEventListener("click", () => {
    const isOpening = formPanel.classList.contains("hidden");
    formPanel.classList.toggle("hidden", !isOpening);
    addButton.setAttribute("aria-expanded", String(isOpening));
    if (isOpening) titleInput.focus();
  });

  cancelButton.addEventListener("click", closeForm);
  categorySelect.addEventListener("change", updateCustomCategory);
  copyButton.addEventListener("click", copyPostsJson);

  postForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    const category = categorySelect.value === "custom"
      ? customCategoryInput.value.trim()
      : categorySelect.value;
    const summary = summaryInput.value.trim();
    const content = contentInput.value
      .split(/\r?\n\s*\r?\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    if (!title || !category || !readTimeInput.value.trim() || !summary || !content.length) {
      setStatus("Tüm alanları doldurun; içerikte en az bir paragraf olmalı.", true);
      return;
    }

    const existingSlugs = new Set(mergePosts(basePosts, localPosts).map((post) => post.slug));
    const baseSlug = createSlug(title) || "yazi";
    let slug = baseSlug;
    let suffix = 2;
    while (existingSlugs.has(slug)) slug = `${baseSlug}-${suffix++}`;

    const newPost = {
      slug,
      title,
      date: new Date().toISOString().slice(0, 10),
      category,
      readTime: readTimeInput.value.trim(),
      summary,
      content
    };
    const updatedLocalPosts = [...localPosts, newPost];

    try {
      localStorage.setItem(storageKey, JSON.stringify(updatedLocalPosts));
    } catch (storageError) {
      setStatus("Yazı tarayıcıya kaydedilemedi. Depolama alanını kontrol edin.", true);
      return;
    }

    localPosts = updatedLocalPosts;
    posts = mergePosts(basePosts, localPosts);
    activeCategory = "Tümü";
    renderFilters();
    renderList();
    closeForm();
    setStatus("Yazı kaydedildi ve listeye eklendi. Kalıcı yayın için JSON çıktısını kopyalayın.");
  });

  localPosts = [];
  try {
    const storedPosts = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(storedPosts)) throw new Error("Yerel yazı verisi geçersiz");
    localPosts = storedPosts.map(normalizePost).filter(Boolean);
  } catch (storageError) {
    setStatus("Tarayıcıdaki yerel yazılar okunamadı.", true);
  }

  try {
    const response = await fetch("posts.json");
    if (!response.ok) throw new Error(`posts.json yüklenemedi (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("posts.json bir yazı listesi olmalı");
    basePosts = data;
  } catch (loadError) {
    setStatus("posts.json yüklenemedi; yalnızca tarayıcıya kaydedilen yazılar gösteriliyor.", true);
  }

  posts = mergePosts(basePosts, localPosts);
  renderFilters();
  renderList();
  updateCustomCategory();
}

if (!window.__vkiSupabaseBlog) document.addEventListener("DOMContentLoaded", initBlogPage);
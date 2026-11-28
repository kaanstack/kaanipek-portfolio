let currentLang = 'tr';

function hasUnsafeHeadlineLanguage(value) {
    const text = String(value || "").toLocaleLowerCase("tr-TR");
    const blockedTerms = [
        /\bfuck(?:ing|ed|er|ers)?\b/i,
        /\bshit(?:ty|ting|s)?\b/i,
        /\basshole\b/i,
        /\bbitch(?:es)?\b/i,
        /\bbastard(?:s)?\b/i,
        /\bdamn(?:ed)?\b/i,
        /\bhassiktir\b/i,
        /\bsiktir\b/i,
        /\bamk\b/i,
        /\boruspu\b/i,
        /\bkahpe\b/i
    ];
    return blockedTerms.some((pattern) => pattern.test(text));
}

async function translateToTurkish(text) {
    if (!text) return "";

    // Kaba kaynak başlıklarını çevirmeye çalışma; orijinal başlık daha güvenli olabilir.
    if (hasUnsafeHeadlineLanguage(text)) return text;

    const cacheKey = `vki_hn_tr_${text}`;
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            // Daha önce kaydedilmiş uygunsuz/bozuk çeviriyi kullanma.
            if (!hasUnsafeHeadlineLanguage(cached)) return cached;
            localStorage.removeItem(cacheKey);
        }
    } catch { /* storage may be unavailable */ }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        let response;
        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|tr&de=iletisim@kaanipek.net.tr`;
            response = await fetch(url, { signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) return text;

        const data = await response.json();
        const translated = data?.responseData?.translatedText || "";
        const status = String(data?.responseStatus || "");
        const isQuotaOrRateLimit =
            status === "429" ||
            /mymemory\s+warning/i.test(translated) ||
            /used all available free translations/i.test(translated) ||
            /next available in/i.test(translated);

        // Küfür, anlamsız tekrar veya servis uyarısı içeren çeviriyi reddet.
        const repeatedPhrase = /(.{3,45})(?:\s+\\1){2,}/i.test(translated);
        if (!translated || isQuotaOrRateLimit || hasUnsafeHeadlineLanguage(translated) || repeatedPhrase) {
            return text;
        }

        try { localStorage.setItem(cacheKey, translated); } catch { /* storage may be unavailable */ }
        return translated;
    } catch {
        return text;
    }
}

const TECH_RADAR_CACHE_KEY = "vki_tech_radar_cache_v1";
const TECH_RADAR_CACHE_TTL = 24 * 60 * 60 * 1000;
const TECH_RADAR_CATEGORIES = ["Tümü", "Yapay Zekâ", "Yazılım", "Siber Güvenlik", "Donanım", "Bulut & DevOps", "Diğer"];

function classifyTechStory(item) {
    const text = `${item.title || ""} ${item.text || ""} ${item.url || ""}`.toLowerCase();
    if (/openai|chatgpt|claude|anthropic|gemini|llm|artificial intelligence|\bai\b|machine learning|deep learning|neural| yapay zek/.test(text)) return "Yapay Zekâ";
    if (/security|cyber|vulnerability|zero.day|malware|ransomware|exploit|cve-|siber güvenlik/.test(text)) return "Siber Güvenlik";
    if (/gpu|cpu|processor|chip|semiconductor|nvidia|amd|intel|arm |hardware|donanım/.test(text)) return "Donanım";
    if (/aws|azure|google cloud|kubernetes|docker|devops|cloud|serverless|infrastructure|linux/.test(text)) return "Bulut & DevOps";
    if (/github|gitlab|programming|developer|javascript|python|rust|linux|database|framework|software|open.source| yazılım/.test(text)) return "Yazılım";
    return "Diğer";
}

function getTechRadarCache() {
    try {
        const value = JSON.parse(localStorage.getItem(TECH_RADAR_CACHE_KEY) || "null");
        return value && Array.isArray(value.stories) ? value : null;
    } catch { return null; }
}

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await mapper(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

async function fetchWithTimeout(url, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchTechRadarStories(force = false) {
    const cached = getTechRadarCache();
    if (!force && cached && Date.now() - cached.fetchedAt < TECH_RADAR_CACHE_TTL) return cached;

    const response = await fetchWithTimeout("https://hacker-news.firebaseio.com/v0/topstories.json", 8000);
    if (!response.ok) throw new Error("Haber listesi alınamadı.");
    const ids = (await response.json()).slice(0, 45);
    if (!Array.isArray(ids) || !ids.length) throw new Error("Haber listesi boş döndü.");

    // Aynı anda en fazla 6 haber isteği gönder; bir hata tüm akışı durdurmasın.
    const items = await mapWithConcurrency(ids, 6, async (id) => {
        try {
            const result = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, 6000);
            if (!result.ok) return null;
            const item = await result.json();
            if (!item || item.deleted || item.dead || !item.title || item.type !== "story") return null;
            return item;
        } catch { return null; }
    });

    const stories = items.filter(Boolean).slice(0, 15).map((item) => ({
        id: item.id,
        title: item.title,
        displayTitle: item.title,
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        domain: (() => { try { return new URL(item.url).hostname.replace(/^www\\./, ""); } catch { return "news.ycombinator.com"; } })(),
        author: item.by || "Hacker News",
        score: item.score || 0,
        comments: item.descendants || 0,
        time: item.time || Math.floor(Date.now() / 1000),
        text: item.text || "",
        kids: Array.isArray(item.kids) ? item.kids : [],
        category: classifyTechStory(item)
    }));

    if (!stories.length) throw new Error("Geçerli haber bulunamadı.");

    // Çeviri servisini de sınırlı kullan; başarısızlıkta orijinal başlık gösterilir.
    await mapWithConcurrency(stories, 3, async (story) => {
        try { story.displayTitle = await translateToTurkish(story.title); } catch { /* fallback title */ }
    });

    const value = { fetchedAt: Date.now(), stories };
    try { localStorage.setItem(TECH_RADAR_CACHE_KEY, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
    return value;
}

function sanitizeNewsHeadline(value) {
    const cleaned = String(value || "")
        .replace(/\b(?:hass?iktir|siktir|fuck(?:ing)?|shit|asshole|bitch)\b[\s,!.:;—-]*/gi, "")
        .replace(/^[\s,!.:;—-]+/, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    return cleaned || "Uygunsuz başlık";
}

function renderTechRadarStories(container, stories, activeCategory = "Tümü", visibleLimit = 5) {
    const visible = activeCategory === "Tümü" ? stories : stories.filter((story) => story.category === activeCategory);
    const loadMoreButton = document.getElementById("techRadarLoadMore");
    container.innerHTML = "";
    if (!visible.length) {
        container.innerHTML = '<p class="news-loading">Bu kategoride şu an haber bulunamadı.</p>';
        if (loadMoreButton) loadMoreButton.hidden = true;
        return;
    }
    visible.slice(0, visibleLimit).forEach((story, index) => {
        const card = document.createElement("article");
        card.className = "news-card";
        card.innerHTML = `
            <div class="news-card-main">
                <div class="news-card-topline">
                    <span class="news-category">${escapeHtml(story.category)}</span>
                    <span class="news-card-domain">${escapeHtml(story.domain)}</span>
                </div>
                <h3 class="news-card-title">${index + 1}. ${escapeHtml(sanitizeNewsHeadline(story.displayTitle || story.title))}</h3>
                <div class="news-card-meta">
                    <span>▲ ${story.score} puan</span>
                    <span>💬 ${story.comments} yorum</span>
                    <span>${new Date(story.time * 1000).toLocaleDateString("tr-TR")}</span>
                </div>
            </div>
            <a class="news-read-hint" href="news.html?id=${encodeURIComponent(story.id)}">Detayları Oku <span aria-hidden="true">→</span></a>
        `;
        container.appendChild(card);
    });
    if (loadMoreButton) {
        const remaining = Math.max(0, visible.length - visibleLimit);
        loadMoreButton.hidden = remaining === 0;
        loadMoreButton.textContent = remaining > 0 ? `Daha fazla haber göster · ${remaining} kaldı` : "";
    }
}

async function renderTechFeed(containerSelector, forceRefresh = false) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const filters = document.getElementById("techRadarFilters");
    const updated = document.getElementById("techRadarUpdated");
    const refreshButton = document.getElementById("techRadarRefresh");
    let activeCategory = "Tümü";
    let visibleLimit = 5;
    const loadMoreButton = document.getElementById("techRadarLoadMore");
    if (loadMoreButton) {
        loadMoreButton.onclick = () => {
            visibleLimit += 5;
            renderTechRadarStories(container, currentStories, activeCategory, visibleLimit);
        };
    }
    let currentStories = [];
    if (refreshButton) refreshButton.disabled = true;

    try {
        const cache = await fetchTechRadarStories(forceRefresh);
        const stories = cache.stories;
        currentStories = stories;
        if (filters) {
            filters.innerHTML = "";
            TECH_RADAR_CATEGORIES.forEach((category) => {
                const count = category === "Tümü" ? stories.length : stories.filter((story) => story.category === category).length;
                if (category !== "Tümü" && count === 0) return;
                const button = document.createElement("button");
                button.type = "button";
                button.className = `tech-filter-btn${category === activeCategory ? " active" : ""}`;
                button.textContent = category;
                button.addEventListener("click", () => {
                    activeCategory = category;
                    visibleLimit = 5;
                    filters.querySelectorAll("button").forEach((node) => node.classList.toggle("active", node === button));
                    renderTechRadarStories(container, stories, activeCategory, visibleLimit);
                });
                filters.appendChild(button);
            });
        }
        renderTechRadarStories(container, stories, activeCategory, visibleLimit);
        if (updated) {
            const date = new Date(cache.fetchedAt);
            updated.textContent = `Son güncelleme: ${date.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}`;
        }
    } catch (error) {
        console.error("Tech Radar yüklenemedi:", error);
        const cached = getTechRadarCache();
        if (cached?.stories?.length) {
            currentStories = cached.stories;
            renderTechRadarStories(container, cached.stories, "Tümü", visibleLimit);
            if (updated) {
                const date = cached.fetchedAt ? new Date(cached.fetchedAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }) : "";
                updated.textContent = date ? `Güncel bağlantı kurulamadı · Son kayıt: ${date}` : "Güncel bağlantı kurulamadı · Kayıtlı haberler gösteriliyor.";
            }
        } else {
            container.innerHTML = '<p class="news-loading">Haberler şu anda yüklenemedi. Lütfen biraz sonra tekrar deneyin.</p>';
        }
    } finally {
        if (refreshButton) refreshButton.disabled = false;
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

    // Ticket submission and public status lookup (Supabase RPC)
    const SUPABASE_URL = "https://dkhkvpspgniygdqgwtyh.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_MPa3mW5WwmD3eVt_PI2X2Q_tqVCYhmd";
    const ticketForm = document.getElementById('ticketForm');
    const successBox = document.getElementById('ticketSuccessBox');
    const ticketBadge = document.getElementById('generatedTicketBadge');
    const ticketText = document.getElementById('ticketSuccessText');
    const hiddenIdInput = document.getElementById('hiddenTicketId');
    const ticketError = document.getElementById('ticketError');
    const ticketSubmitButton = ticketForm?.querySelector('button[type="submit"]');
    const supabaseHeaders = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
    };

    ticketForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!ticketForm.reportValidity() || ticketSubmitButton?.disabled) return;

        if (ticketError) {
            ticketError.hidden = true;
            ticketError.textContent = '';
        }
        const originalButtonText = ticketSubmitButton?.textContent || '';
        if (ticketSubmitButton) {
            ticketSubmitButton.disabled = true;
            ticketSubmitButton.textContent = currentLang === 'tr' ? 'Gönderiliyor…' : 'Sending…';
            ticketSubmitButton.setAttribute('aria-busy', 'true');
        }

        const formData = new FormData(ticketForm);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const createResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_ticket`, {
                method: 'POST',
                headers: supabaseHeaders,
                body: JSON.stringify({
                    p_name: formData.get('name'),
                    p_email: formData.get('email'),
                    p_category: formData.get('category'),
                    p_priority: formData.get('priority'),
                    p_message: formData.get('message')
                }),
                signal: controller.signal
            });
            if (!createResponse.ok) {
                const details = await createResponse.text();
                throw new Error(`Ticket API HTTP ${createResponse.status}: ${details}`);
            }

            const created = await createResponse.json();
            const ticketNumber = created?.ticket_number;
            if (!ticketNumber) throw new Error('Ticket API returned no reference number.');

            if (hiddenIdInput) hiddenIdInput.value = `#${ticketNumber}`;
            formData.set('ticket-id', `#${ticketNumber}`);

            // Keep Netlify Forms as a secondary inbox; Supabase is the source of truth.
            try {
                await fetch('/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams(formData).toString()
                });
            } catch (backupError) {
                console.warn('Netlify backup submission failed; ticket is safely stored in Supabase.', backupError);
            }

            ticketBadge.textContent = `#${ticketNumber}`;
            ticketText.textContent = currentLang === 'tr'
                ? `Talebiniz başarıyla kaydedildi. Takip numaranız: #${ticketNumber}. Bu numarayı saklayın.`
                : `Your request has been saved. Your reference number is #${ticketNumber}. Please keep it safe.`;

            ticketForm.hidden = true;
            successBox.hidden = false;
            successBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (error) {
            console.error('Ticket submission failed:', error);
            if (hiddenIdInput) hiddenIdInput.value = '';
            if (ticketError) {
                ticketError.textContent = currentLang === 'tr'
                    ? (error.name === 'AbortError'
                        ? 'Gönderim zaman aşımına uğradı. Lütfen tekrar deneyin.'
                        : 'Talep kaydedilemedi. Lütfen biraz sonra tekrar deneyin.')
                    : (error.name === 'AbortError'
                        ? 'The request timed out. Please try again.'
                        : 'The request could not be saved. Please try again shortly.');
                ticketError.hidden = false;
            }
        } finally {
            clearTimeout(timeoutId);
            if (ticketSubmitButton) {
                ticketSubmitButton.disabled = false;
                ticketSubmitButton.textContent = originalButtonText;
                ticketSubmitButton.removeAttribute('aria-busy');
            }
        }
    });

    document.getElementById('newTicketBtn')?.addEventListener('click', () => {
        ticketForm.reset();
        if (ticketError) {
            ticketError.hidden = true;
            ticketError.textContent = '';
        }
        successBox.hidden = true;
        ticketForm.hidden = false;
    });

    const lookupForm = document.getElementById('ticketLookupForm');
    const lookupInput = document.getElementById('ticketLookupNumber');
    const lookupError = document.getElementById('ticketLookupError');
    const lookupResult = document.getElementById('ticketLookupResult');
    const ticketStatusLabels = {
        received: currentLang === 'tr' ? 'Talep alındı' : 'Request received',
        in_progress: currentLang === 'tr' ? 'İnceleniyor' : 'In progress',
        resolved: currentLang === 'tr' ? 'Çözüldü' : 'Resolved',
        closed: currentLang === 'tr' ? 'Kapatıldı' : 'Closed'
    };

    lookupForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!lookupForm.reportValidity()) return;
        lookupError.hidden = true;
        lookupResult.hidden = true;
        lookupResult.textContent = '';
        const button = lookupForm.querySelector('button[type="submit"]');
        const oldText = button.textContent;
        button.disabled = true;
        button.textContent = currentLang === 'tr' ? 'Sorgulanıyor…' : 'Checking…';

        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_ticket_status`, {
                method: 'POST',
                headers: supabaseHeaders,
                body: JSON.stringify({ p_ticket_number: lookupInput.value.trim() })
            });
            if (!response.ok) throw new Error(`Ticket lookup HTTP ${response.status}`);
            const rows = await response.json();
            const ticket = Array.isArray(rows) ? rows[0] : null;
            if (!ticket) {
                lookupError.textContent = currentLang === 'tr'
                    ? 'Bu takip numarasıyla eşleşen bir talep bulunamadı. Numarayı kontrol edin.'
                    : 'No request was found for this reference number. Please check it.';
                lookupError.hidden = false;
                return;
            }

            const statusText = ticketStatusLabels[ticket.status] || ticketStatusLabels.received;
            const dateText = new Date(ticket.created_at).toLocaleDateString(currentLang === 'tr' ? 'tr-TR' : 'en-GB');
            const title = document.createElement('strong');
            title.textContent = currentLang === 'tr' ? 'Talep durumu' : 'Request status';
            const status = document.createElement('span');
            status.className = 'ticket-status-pill';
            status.textContent = statusText;
            const reference = document.createElement('p');
            reference.textContent = `#${ticket.ticket_number}`;
            const created = document.createElement('small');
            created.textContent = (currentLang === 'tr' ? 'Oluşturulma tarihi: ' : 'Created: ') + dateText;
            lookupResult.append(title, status, reference, created);
            lookupResult.hidden = false;
        } catch (error) {
            console.error('Ticket lookup failed:', error);
            lookupError.textContent = currentLang === 'tr'
                ? 'Sorgulama şu anda yapılamıyor. Lütfen tekrar deneyin.'
                : 'Status lookup is temporarily unavailable. Please try again.';
            lookupError.hidden = false;
        } finally {
            button.disabled = false;
            button.textContent = oldText;
        }
    });

    renderTechFeed("#hn-news-list");
    document.getElementById("techRadarRefresh")?.addEventListener("click", () => renderTechFeed("#hn-news-list", true));
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
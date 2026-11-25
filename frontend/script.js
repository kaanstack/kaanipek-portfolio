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

function escapeHtml(str) {
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
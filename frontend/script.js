let currentLang = 'tr';
let cachedStories = [];

async function translateToTurkish(text) {
    if (!text) return '';
    try {
        const cleanText = text.replace(/<[^>]*>?/gm, '').slice(0, 480);
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=en|tr`);
        const data = await res.json();
        return data.responseData?.translatedText || cleanText;
    } catch {
        return text;
    }
}

function getDomainName(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return 'news.ycombinator.com';
    }
}

async function loadTopNews() {
    const newsList = document.getElementById('hn-news-list');
    if (!newsList) return;

    try {
        const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
        const ids = await res.json();
        const top5 = ids.slice(0, 5);

        const rawStories = await Promise.all(
            top5.map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json()))
        );

        cachedStories = await Promise.all(
            rawStories.map(async (story) => {
                const url = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
                const domain = getDomainName(url);
                const trTitle = await translateToTurkish(story.title);

                const rawText = story.text ? story.text.replace(/<[^>]*>?/gm, ' ') : '';
                const enSummary = rawText
                    ? rawText
                    : `Published on ${domain} by ${story.by}. Currently trending on Hacker News with ${story.score} points and ${story.descendants || 0} community discussions.`;

                const trSummary = rawText
                    ? await translateToTurkish(rawText)
                    : `${domain} kaynağında ${story.by} tarafından paylaşılan bu gelişme, Hacker News teknoloji topluluğunda ${story.score} puan ve ${story.descendants || 0} yorum ile öne çıkan başlıklar arasında yer alıyor.`;

                return {
                    id: story.id,
                    author: story.by,
                    domain,
                    enTitle: story.title,
                    trTitle,
                    enSummary,
                    trSummary,
                    url,
                    score: story.score,
                    comments: story.descendants || 0
                };
            })
        );

        renderNews();
    } catch {
        newsList.innerHTML = `<div class="news-loading">${currentLang === 'tr' ? 'Haberler şu an yüklenemedi.' : 'Failed to load news.'}</div>`;
    }
}

function renderNews() {
    const newsList = document.getElementById('hn-news-list');
    if (!newsList || cachedStories.length === 0) return;

    newsList.innerHTML = cachedStories.map((story, idx) => {
        const title = currentLang === 'tr' ? story.trTitle : story.enTitle;
        const meta = currentLang === 'tr'
            ? `${story.domain} • ▲ ${story.score} puan • 💬 ${story.comments} yorum`
            : `${story.domain} • ▲ ${story.score} points • 💬 ${story.comments} comments`;
        const hint = currentLang === 'tr' ? 'Detayı Oku →' : 'Read Details →';

        return `
            <article class="news-card" data-story-index="${idx}">
                <div>
                    <div class="news-card-title">${idx + 1}. ${title}</div>
                    <div class="news-card-meta">${meta}</div>
                </div>
                <span class="news-read-hint">${hint}</span>
            </article>
        `;
    }).join('');

    document.querySelectorAll('.news-card').forEach(card => {
        card.addEventListener('click', () => {
            const index = Number(card.dataset.storyIndex);
            openNewsModal(cachedStories[index]);
        });
    });
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
    renderNews();
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

    loadTopNews();
});
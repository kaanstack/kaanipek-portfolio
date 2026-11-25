(() => {
  "use strict";

  const SUPABASE_URL = "https://dkhkvpspgniygdqgwtyh.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MPa3mW5WwmD3eVt_PI2X2Q_tqVCYhmd";
  const ADMIN_UID = "03347b3f-833f-4ff0-97d2-2dd1e4348b3f";
  const normalizeUid = (value) => String(value || "").trim().toLowerCase();
  const STATUS_LABELS = {
    received: "Talep alındı",
    in_progress: "İnceleniyor",
    resolved: "Çözüldü",
    closed: "Kapatıldı"
  };
  const CATEGORY_LABELS = {
    internship: "Staj",
    collaboration: "İş birliği",
    technical: "Teknik destek",
    general: "Genel"
  };
  const PRIORITY_LABELS = { low: "Düşük", normal: "Normal", high: "Yüksek" };

  const $ = (id) => document.getElementById(id);
  const loginView = $("loginView");
  const dashboardView = $("dashboardView");
  const loginForm = $("loginForm");
  const loginMessage = $("loginMessage");
  const dashboardMessage = $("dashboardMessage");
  const loginButton = $("loginButton");
  const logoutButton = $("logoutButton");
  const ticketList = $("ticketList");
  const searchInput = $("ticketSearch");
  const statusFilter = $("statusFilter");

  let supabase;
  let tickets = [];

  function setMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("is-error", isError);
  }

  function showDashboard(isVisible) {
    loginView.classList.toggle("hidden", isVisible);
    dashboardView.classList.toggle("hidden", !isVisible);
    logoutButton.classList.toggle("hidden", !isVisible);
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium", timeStyle: "short"
    }).format(new Date(value));
  }

  function updateStats() {
    $("totalCount").textContent = tickets.length;
    $("receivedCount").textContent = tickets.filter(t => t.status === "received").length;
    $("progressCount").textContent = tickets.filter(t => t.status === "in_progress").length;
    $("resolvedCount").textContent = tickets.filter(t => t.status === "resolved").length;
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderTickets() {
    const query = searchInput.value.trim().toLocaleLowerCase("tr-TR");
    const selectedStatus = statusFilter.value;
    const filtered = tickets.filter(ticket => {
      const matchesStatus = selectedStatus === "all" || ticket.status === selectedStatus;
      const searchable = [ticket.ticket_number, ticket.name, ticket.email, ticket.message]
        .join(" ").toLocaleLowerCase("tr-TR");
      return matchesStatus && searchable.includes(query);
    });

    ticketList.replaceChildren();
    if (!filtered.length) {
      ticketList.append(makeElement("div", "card admin-empty", "Bu filtreyle eşleşen destek talebi bulunamadı."));
      return;
    }

    filtered.forEach(ticket => {
      const card = makeElement("article", "card admin-ticket");
      const top = makeElement("div", "admin-ticket-top");
      const identity = document.createElement("div");
      identity.append(
        makeElement("div", "admin-ticket-number", "#" + ticket.ticket_number),
        makeElement("h3", "", ticket.name || "İsimsiz kullanıcı")
      );
      const priority = makeElement("span", "admin-priority", "Öncelik: " + (PRIORITY_LABELS[ticket.priority] || ticket.priority));
      top.append(identity, priority);

      const meta = makeElement("div", "admin-ticket-meta");
      meta.append(
        makeElement("span", "", ticket.email || "E-posta yok"),
        makeElement("span", "", CATEGORY_LABELS[ticket.category] || ticket.category),
        makeElement("span", "", formatDate(ticket.created_at))
      );

      const message = makeElement("p", "admin-ticket-message", ticket.message || "");
      const actions = makeElement("div", "admin-ticket-actions");
      const statusText = makeElement("span", "admin-muted", "Talep durumu");
      const select = makeElement("select", "ticket-status-select");
      select.setAttribute("aria-label", ticket.ticket_number + " talep durumu");
      Object.entries(STATUS_LABELS).forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = ticket.status === value;
        select.append(option);
      });
      select.addEventListener("change", () => updateTicketStatus(ticket, select));
      actions.append(statusText, select);
      card.append(top, meta, message, actions);
      ticketList.append(card);
    });
  }

  async function loadTickets() {
    setMessage(dashboardMessage, "Destek talepleri yükleniyor…");
    const { data, error } = await supabase
      .from("tickets")
      .select("id,ticket_number,name,email,category,priority,message,status,created_at,updated_at")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(dashboardMessage, "Talepler yüklenemedi: " + error.message, true);
      return;
    }

    tickets = data || [];
    updateStats();
    renderTickets();
    setMessage(dashboardMessage, tickets.length ? tickets.length + " destek talebi yüklendi." : "Henüz destek talebi yok.");
  }

  async function updateTicketStatus(ticket, select) {
    const previousStatus = ticket.status;
    const nextStatus = select.value;
    select.disabled = true;

    const { error } = await supabase
      .from("tickets")
      .update({ status: nextStatus })
      .eq("id", ticket.id);

    select.disabled = false;
    if (error) {
      select.value = previousStatus;
      setMessage(dashboardMessage, "Durum güncellenemedi: " + error.message, true);
      return;
    }

    ticket.status = nextStatus;
    updateStats();
    renderTickets();
    setMessage(dashboardMessage, "#" + ticket.ticket_number + " durumu güncellendi.");
  }

  async function startSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (normalizeUid(session?.user?.id) === normalizeUid(ADMIN_UID)) {
      showDashboard(true);
      await loadTickets();
      return;
    }
    if (session) await supabase.auth.signOut();
    showDashboard(false);
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(loginMessage, "");
    loginButton.disabled = true;
    loginButton.textContent = "Kontrol ediliyor…";

    const email = $("adminEmail").value.trim();
    const password = $("adminPassword").value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(loginMessage, "Giriş başarısız. E-posta veya şifreni kontrol et.", true);
    } else if (normalizeUid(data.user?.id) !== normalizeUid(ADMIN_UID)) {
      const returnedUid = data.user?.id || "(Supabase kullanıcı ID döndürmedi)";
      await supabase.auth.signOut();
      const expectedUid = normalizeUid(ADMIN_UID);
      const actualUid = normalizeUid(data.user?.id);
      const toCodes = (value) => Array.from(value, char => char.codePointAt(0).toString(16)).join(" ");
      const diagnostic = "Giriş ID kodları: " + toCodes(actualUid) + " | Kod ID kodları: " + toCodes(expectedUid) + " | Eşitlik: " + String(actualUid === expectedUid) + ". Build: admin-uuid-debug-3."; 
      setMessage(loginMessage, diagnostic, true);
    } else {
      showDashboard(true);
      await loadTickets();
    }

    loginButton.disabled = false;
    loginButton.textContent = "Giriş yap";
  });

  logoutButton.addEventListener("click", async () => {
    await supabase.auth.signOut();
    tickets = [];
    showDashboard(false);
    loginForm.reset();
    setMessage(loginMessage, "Oturum kapatıldı.");
  });

  $("refreshButton").addEventListener("click", loadTickets);
  searchInput.addEventListener("input", renderTickets);
  statusFilter.addEventListener("change", renderTickets);

  if (!window.supabase?.createClient) {
    setMessage(loginMessage, "Supabase istemcisi yüklenemedi. Sayfayı yenileyip tekrar dene.", true);
    return;
  }

  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  startSession().catch(error => {
    showDashboard(false);
    setMessage(loginMessage, "Oturum kontrol edilemedi: " + error.message, true);
  });
})();
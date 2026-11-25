(() => {
  "use strict";

  const SUPABASE_URL = "https://dkhkvpspgniygdqgwtyh.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MPa3mW5WwmD3eVt_PI2X2Q_tqVCYhmd";
  const ADMIN_UID = "03347b3f-833f-4ff0-97d0-2dd1e4348b3f";
  const PAGE_SIZE = 20;
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
  const logoutButton = $("logoutButton");
  let supabase;
  let ticketPage = 0;
  let archivePage = 0;
  let ticketCount = 0;
  let archiveCount = 0;
  let activeView = "ticketsView";
  let searchTimer;

  function setMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("is-error", isError);
  }

  function showDashboard(visible) {
    loginView.classList.toggle("hidden", visible);
    dashboardView.classList.toggle("hidden", !visible);
    logoutButton.classList.toggle("hidden", !visible);
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function safeSearchTerm(value) {
    return value.trim().replace(/[(),."\\]/g, " ").replace(/\s+/g, " ").slice(0, 100);
  }

  function ticketQuery(archived, search, status) {
    let query = supabase.from("tickets")
      .select("id,ticket_number,name,email,category,priority,message,status,created_at,updated_at,archived_at", { count: "exact" })
      .order("created_at", { ascending: false });
    query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    if (status !== "all") query = query.eq("status", status);
    const term = safeSearchTerm(search);
    if (term) {
      const pattern = "%" + term + "%";
      query = query.or("ticket_number.ilike." + pattern + ",name.ilike." + pattern + ",email.ilike." + pattern + ",message.ilike." + pattern);
    }
    return query;
  }

  async function loadStats() {
    const countFor = async (status) => {
      let query = supabase.from("tickets").select("id", { count: "exact", head: true }).is("archived_at", null);
      if (status) query = query.eq("status", status);
      const result = await query;
      if (result.error) throw result.error;
      return result.count || 0;
    };
    const [total, received, progress, resolved] = await Promise.all([
      countFor(null), countFor("received"), countFor("in_progress"), countFor("resolved")
    ]);
    $("totalCount").textContent = total;
    $("receivedCount").textContent = received;
    $("progressCount").textContent = progress;
    $("resolvedCount").textContent = resolved;
  }

  function updatePagination(prefix, page, count) {
    const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    $(prefix + "PageInfo").textContent = "Sayfa " + (page + 1) + " / " + totalPages + " · " + count + " kayıt";
    $(prefix + "Prev").disabled = page <= 0;
    $(prefix + "Next").disabled = page + 1 >= totalPages;
  }

  function createTicketCard(ticket, archived) {
    const card = makeElement("article", "card admin-ticket");
    const top = makeElement("div", "admin-ticket-top");
    const identity = document.createElement("div");
    identity.append(
      makeElement("div", "admin-ticket-number", "#" + ticket.ticket_number),
      makeElement("h3", "", ticket.name || "İsimsiz kullanıcı")
    );
    top.append(identity, makeElement("span", "admin-priority", "Öncelik: " + (PRIORITY_LABELS[ticket.priority] || ticket.priority)));

    const meta = makeElement("div", "admin-ticket-meta");
    meta.append(
      makeElement("span", "", ticket.email || "E-posta yok"),
      makeElement("span", "", CATEGORY_LABELS[ticket.category] || ticket.category),
      makeElement("span", "", formatDate(ticket.created_at))
    );
    const message = makeElement("p", "admin-ticket-message", ticket.message || "");
    const actions = makeElement("div", "admin-ticket-actions");
    const actionGroup = makeElement("div", "admin-ticket-action-group");

    if (!archived) {
      const statusWrap = makeElement("label", "admin-status-wrap");
      statusWrap.append(makeElement("span", "admin-muted", "Durum"));
      const select = makeElement("select", "ticket-status-select");
      Object.entries(STATUS_LABELS).forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = ticket.status === value;
        select.append(option);
      });
      select.addEventListener("change", async () => {
        select.disabled = true;
        const { error } = await supabase.from("tickets").update({ status: select.value }).eq("id", ticket.id);
        select.disabled = false;
        if (error) {
          select.value = ticket.status;
          setMessage($("ticketsMessage"), "Durum güncellenemedi: " + error.message, true);
          return;
        }
        setMessage($("ticketsMessage"), "#" + ticket.ticket_number + " durumu güncellendi.");
        await Promise.all([loadTickets(), loadStats()]);
      });
      statusWrap.append(select);
      actionGroup.append(statusWrap);
      const archiveButton = makeElement("button", "btn btn-secondary admin-small-button", "Arşivle");
      archiveButton.type = "button";
      archiveButton.addEventListener("click", () => archiveTicket(ticket));
      actionGroup.append(archiveButton);
    } else {
      const restoreButton = makeElement("button", "btn btn-secondary admin-small-button", "Arşivden çıkar");
      restoreButton.type = "button";
      restoreButton.addEventListener("click", () => restoreTicket(ticket));
      actionGroup.append(restoreButton);
    }

    const deleteButton = makeElement("button", "btn btn-danger admin-small-button", "Kalıcı sil");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => deleteTicket(ticket, archived));
    actionGroup.append(deleteButton);
    actions.append(actionGroup);
    card.append(top, meta, message, actions);
    return card;
  }

  async function loadTicketList(archived) {
    const prefix = archived ? "archive" : "tickets";
    const list = $(archived ? "archiveList" : "ticketList");
    const message = $(archived ? "archiveMessage" : "ticketsMessage");
    const page = archived ? archivePage : ticketPage;
    setMessage(message, "Kayıtlar yükleniyor…");
    list.replaceChildren();
    const { data, error, count } = await ticketQuery(
      archived,
      $(archived ? "archiveSearch" : "ticketSearch").value,
      $(archived ? "archiveStatusFilter" : "statusFilter").value
    ).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) {
      setMessage(message, "Kayıtlar yüklenemedi: " + error.message, true);
      return;
    }
    if (archived) archiveCount = count || 0;
    else ticketCount = count || 0;

    if (!data?.length) list.append(makeElement("div", "card admin-empty", "Bu bölümde gösterilecek kayıt bulunamadı."));
    else data.forEach(ticket => list.append(createTicketCard(ticket, archived)));
    updatePagination(prefix, page, count || 0);
    setMessage(message, (count || 0) + " kayıt bulundu. Sayfa başına en fazla " + PAGE_SIZE + " kayıt yükleniyor.");
  }

  async function loadTickets() {
    if (activeView === "archiveView") return loadTicketList(true);
    return loadTicketList(false);
  }

  async function archiveTicket(ticket) {
    if (!window.confirm("#" + ticket.ticket_number + " numaralı talep arşivlensin mi? Kayıt silinmeyecek.")) return;
    const { error } = await supabase.from("tickets").update({ archived_at: new Date().toISOString() }).eq("id", ticket.id);
    if (error) {
      setMessage($("ticketsMessage"), "Talep arşivlenemedi: " + error.message, true);
      return;
    }
    setMessage($("ticketsMessage"), "Talep arşivlendi.");
    await Promise.all([loadTicketList(false), loadStats()]);
  }

  async function restoreTicket(ticket) {
    const { error } = await supabase.from("tickets").update({ archived_at: null }).eq("id", ticket.id);
    if (error) {
      setMessage($("archiveMessage"), "Talep arşivden çıkarılamadı: " + error.message, true);
      return;
    }
    setMessage($("archiveMessage"), "Talep aktif listeye taşındı.");
    await Promise.all([loadTicketList(true), loadStats()]);
  }

  async function deleteTicket(ticket, archived) {
    const confirmed = window.confirm(
      "#" + ticket.ticket_number + " numaralı talep kalıcı olarak silinsin mi? Bu işlem geri alınamaz ve talep takip numarası artık çalışmaz."
    );
    if (!confirmed) return;
    const { error } = await supabase.from("tickets").delete().eq("id", ticket.id);
    if (error) {
      setMessage($(archived ? "archiveMessage" : "ticketsMessage"), "Talep silinemedi: " + error.message, true);
      return;
    }
    setMessage($(archived ? "archiveMessage" : "ticketsMessage"), "Talep kalıcı olarak silindi.");
    await Promise.all([loadTicketList(archived), loadStats()]);
  }

  function switchView(viewId) {
    activeView = viewId;
    document.querySelectorAll(".admin-panel-view").forEach(view => view.classList.toggle("hidden", view.id !== viewId));
    document.querySelectorAll(".admin-tab").forEach(tab => tab.classList.toggle("is-active", tab.dataset.view === viewId));
    if (viewId === "ticketsView") loadTicketList(false);
    if (viewId === "archiveView") loadTicketList(true);
    if (viewId === "versionsView") loadVersions();
  }

  async function loadVersions() {
    setMessage($("versionsMessage"), "Sürümler yükleniyor…");
    const list = $("versionList");
    list.replaceChildren();
    const { data, error } = await supabase.from("site_versions")
      .select("id,version,release_notes,commit_url,released_at,is_current,created_at")
      .order("released_at", { ascending: false });
    if (error) {
      setMessage($("versionsMessage"), "Sürümler yüklenemedi. Önce yönetim paneli SQL güncellemesini çalıştır: " + error.message, true);
      return;
    }
    if (!data?.length) {
      list.append(makeElement("div", "card admin-empty", "Henüz sürüm kaydı yok. İlk sürümünü yukarıdaki formdan ekleyebilirsin."));
    } else {
      data.forEach(version => {
        const card = makeElement("article", "card admin-version-card");
        const head = makeElement("div", "admin-version-head");
        const titleWrap = document.createElement("div");
        titleWrap.append(
          makeElement("h3", "", "v" + version.version),
          makeElement("span", "admin-muted", new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(new Date(version.released_at)))
        );
        head.append(titleWrap, makeElement("span", version.is_current ? "admin-current-badge" : "admin-priority", version.is_current ? "Güncel sürüm" : "Geçmiş sürüm"));
        const notes = makeElement("p", "admin-version-notes", version.release_notes);
        const actions = makeElement("div", "admin-version-actions");
        if (version.commit_url) {
          const commit = makeElement("a", "btn btn-secondary admin-small-button", "GitHub commit ↗");
          commit.href = version.commit_url;
          commit.target = "_blank";
          commit.rel = "noopener noreferrer";
          actions.append(commit);
        }
        if (!version.is_current) {
          const current = makeElement("button", "btn btn-secondary admin-small-button", "Güncel olarak işaretle");
          current.type = "button";
          current.addEventListener("click", () => setCurrentVersion(version));
          actions.append(current);
        }
        const remove = makeElement("button", "btn btn-danger admin-small-button", "Sil");
        remove.type = "button";
        remove.addEventListener("click", () => deleteVersion(version));
        actions.append(remove);
        card.append(head, notes, actions);
        list.append(card);
      });
    }
    setMessage($("versionsMessage"), data?.length ? data.length + " sürüm kaydı yüklendi." : "Sürüm geçmişi boş.");
  }

  async function setCurrentVersion(version) {
    if (!window.confirm("v" + version.version + " güncel sürüm olarak işaretlensin mi?")) return;
    const clear = await supabase.from("site_versions").update({ is_current: false }).eq("is_current", true);
    if (clear.error) {
      setMessage($("versionsMessage"), "Mevcut sürüm kaldırılamadı: " + clear.error.message, true);
      return;
    }
    const set = await supabase.from("site_versions").update({ is_current: true }).eq("id", version.id);
    if (set.error) {
      setMessage($("versionsMessage"), "Yeni güncel sürüm ayarlanamadı: " + set.error.message, true);
      return;
    }
    await loadVersions();
  }

  async function deleteVersion(version) {
    if (!window.confirm("v" + version.version + " sürüm kaydı silinsin mi?")) return;
    const { error } = await supabase.from("site_versions").delete().eq("id", version.id);
    if (error) {
      setMessage($("versionsMessage"), "Sürüm silinemedi: " + error.message, true);
      return;
    }
    await loadVersions();
  }

  $("versionDate").value = new Date().toISOString().slice(0, 10);
  $("versionForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("addVersionButton");
    button.disabled = true;
    const version = $("versionNumber").value.trim().replace(/^v/i, "");
    const commitUrl = $("versionCommit").value.trim() || null;
    if (commitUrl && !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/commit\/[A-Fa-f0-9]+(?:\?.*)?$/.test(commitUrl)) {
      setMessage($("versionsMessage"), "GitHub commit bağlantısı geçerli bir commit URL'si olmalı.", true);
      button.disabled = false;
      return;
    }
    const { error } = await supabase.from("site_versions").insert({
      version,
      release_notes: $("versionNotes").value.trim(),
      commit_url: commitUrl,
      released_at: new Date($("versionDate").value + "T12:00:00").toISOString(),
      is_current: false
    });
    if (error) {
      setMessage($("versionsMessage"), "Sürüm kaydedilemedi: " + error.message, true);
    } else {
      $("versionForm").reset();
      $("versionDate").value = new Date().toISOString().slice(0, 10);
      setMessage($("versionsMessage"), "Sürüm kaydedildi.");
      await loadVersions();
    }
    button.disabled = false;
  });

  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    setMessage(loginMessage, "");
    const button = $("loginButton");
    button.disabled = true;
    button.textContent = "Kontrol ediliyor…";
    const { data, error } = await supabase.auth.signInWithPassword({
      email: $("adminEmail").value.trim(),
      password: $("adminPassword").value
    });
    if (error) setMessage(loginMessage, "Giriş başarısız. E-posta veya şifreni kontrol et.", true);
    else if (data.user?.id !== ADMIN_UID) {
      await supabase.auth.signOut();
      setMessage(loginMessage, "Bu hesap yönetici olarak yetkili değil.", true);
    } else {
      showDashboard(true);
      try {
        await Promise.all([loadStats(), loadTicketList(false)]);
      } catch (err) {
        setMessage($("ticketsMessage"), "Panel verileri yüklenemedi: " + err.message, true);
      }
    }
    button.disabled = false;
    button.textContent = "Giriş yap";
  });

  $("logoutButton").addEventListener("click", async () => {
    await supabase.auth.signOut();
    showDashboard(false);
    loginForm.reset();
  });
  $("refreshButton").addEventListener("click", async () => {
    try {
      await Promise.all([loadStats(), activeView === "versionsView" ? loadVersions() : loadTickets()]);
    } catch (err) {
      setMessage($(activeView === "archiveView" ? "archiveMessage" : activeView === "versionsView" ? "versionsMessage" : "ticketsMessage"), err.message, true);
    }
  });
  document.querySelectorAll(".admin-tab").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  $("ticketSearch").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { ticketPage = 0; loadTicketList(false); }, 300); });
  $("archiveSearch").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { archivePage = 0; loadTicketList(true); }, 300); });
  $("statusFilter").addEventListener("change", () => { ticketPage = 0; loadTicketList(false); });
  $("archiveStatusFilter").addEventListener("change", () => { archivePage = 0; loadTicketList(true); });
  $("ticketsPrev").addEventListener("click", () => { ticketPage = Math.max(0, ticketPage - 1); loadTicketList(false); });
  $("ticketsNext").addEventListener("click", () => { if ((ticketPage + 1) * PAGE_SIZE < ticketCount) ticketPage++; loadTicketList(false); });
  $("archivePrev").addEventListener("click", () => { archivePage = Math.max(0, archivePage - 1); loadTicketList(true); });
  $("archiveNext").addEventListener("click", () => { if ((archivePage + 1) * PAGE_SIZE < archiveCount) archivePage++; loadTicketList(true); });

  if (!window.supabase?.createClient) {
    setMessage(loginMessage, "Supabase istemcisi yüklenemedi. Sayfayı yenileyip tekrar dene.", true);
    return;
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  supabase.auth.getSession().then(async ({ data, error }) => {
    if (error) throw error;
    if (data.session?.user?.id === ADMIN_UID) {
      showDashboard(true);
      await Promise.all([loadStats(), loadTicketList(false)]);
    } else if (data.session) {
      await supabase.auth.signOut();
    }
  }).catch(error => setMessage(loginMessage, "Oturum kontrol edilemedi: " + error.message, true));
})();
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
  let activeView = "overviewView";
  let searchTimer;
  let editingDevelopmentId = null;

  function setMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("is-error", isError);
  }

  function showDashboard(visible) {
    loginView.classList.toggle("hidden", visible);
    dashboardView.classList.toggle("hidden", !visible);
    logoutButton.classList.toggle("hidden", !visible);
  }

  function announceAdminSession(session) {
    if (session?.user?.id === ADMIN_UID) {
      window.dispatchEvent(new CustomEvent("vki:admin-authorized", { detail: { userId: session.user.id } }));
    }
  }

  async function routeAuthorizedSession(session) {
    if (!session?.user) return "none";
    if (session.user.id === ADMIN_UID) return "admin";
    const { data, error } = await supabase.from("blog_user_roles")
      .select("role").eq("user_id", session.user.id).maybeSingle();
    if (!error && data?.role === "editor") {
      window.location.replace("editor.html");
      return "editor";
    }
    await supabase.auth.signOut();
    return "none";
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


  let editingAccountId = null;

  function resetAccountForm() {
    editingAccountId = null;
    $("accountForm").reset();
    $("accountFormTitle").textContent = "Yeni hesap ekle";
    $("saveAccountButton").textContent = "Hesabı kaydet";
    $("cancelAccountEdit").classList.add("hidden");
  }

  function validAccountUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : false;
    } catch {
      return false;
    }
  }

  function createAccountCard(account) {
    const card = makeElement("article", "card admin-account-card");
    const header = makeElement("div", "admin-account-card-head");
    const details = document.createElement("div");
    details.append(
      makeElement("h3", "", account.platform),
      makeElement("p", "admin-account-username", account.username || "Kullanıcı adı eklenmemiş")
    );
    header.append(details);
    if (account.login_url) {
      const link = makeElement("a", "btn btn-secondary admin-small-button", "Giriş sayfası ↗");
      link.href = account.login_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      header.append(link);
    }
    card.append(header);
    if (account.notes) card.append(makeElement("p", "admin-account-notes", account.notes));
    const actions = makeElement("div", "admin-account-actions");
    const edit = makeElement("button", "btn btn-secondary admin-small-button", "Düzenle");
    edit.type = "button";
    edit.addEventListener("click", () => {
      editingAccountId = account.id;
      $("accountPlatform").value = account.platform || "";
      $("accountUsername").value = account.username || "";
      $("accountUrl").value = account.login_url || "";
      $("accountNotes").value = account.notes || "";
      $("accountFormTitle").textContent = "Hesabı düzenle";
      $("saveAccountButton").textContent = "Değişiklikleri kaydet";
      $("cancelAccountEdit").classList.remove("hidden");
      $("accountPlatform").focus();
      $("accountForm").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const remove = makeElement("button", "btn btn-danger admin-small-button", "Sil");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      if (!window.confirm(account.platform + " hesabının kayıt bilgileri silinsin mi?")) return;
      const { error } = await supabase.from("account_inventory").delete().eq("id", account.id);
      if (error) {
        setMessage($("accountsMessage"), "Kayıt silinemedi: " + error.message, true);
        return;
      }
      if (editingAccountId === account.id) resetAccountForm();
      await loadAccounts();
    });
    actions.append(edit, remove);
    card.append(actions);
    return card;
  }

  async function loadAccounts() {
    const list = $("accountList");
    if (!list) return;
    list.replaceChildren();
    setMessage($("accountsMessage"), "Hesap kayıtları yükleniyor…");
    const { data, error } = await supabase.from("account_inventory")
      .select("id,platform,username,login_url,notes,created_at,updated_at")
      .order("platform", { ascending: true });
    if (error) {
      setMessage($("accountsMessage"), "Hesap kayıtları yüklenemedi. Önce supabase/account-inventory.sql dosyasını Supabase SQL Editor'de çalıştır. " + error.message, true);
      return;
    }
    if (!data?.length) {
      list.append(makeElement("div", "card admin-empty", "Henüz hesap eklenmemiş. İlk platform hesabını yukarıdaki formdan ekleyebilirsin."));
    } else {
      data.forEach(account => list.append(createAccountCard(account)));
    }
    setMessage($("accountsMessage"), data?.length ? data.length + " hesap kaydı." : "Hesap listen hazır.");
  }

  $("accountForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("saveAccountButton");
    const platform = $("accountPlatform").value.trim();
    const username = $("accountUsername").value.trim();
    const rawUrl = $("accountUrl").value.trim();
    const loginUrl = validAccountUrl(rawUrl);
    if (loginUrl === false) {
      setMessage($("accountsMessage"), "Giriş bağlantısı https:// ile başlayan geçerli bir adres olmalı.", true);
      return;
    }
    const payload = {
      platform,
      username: username || null,
      login_url: loginUrl,
      notes: $("accountNotes").value.trim() || null,
      updated_at: new Date().toISOString()
    };
    button.disabled = true;
    const result = editingAccountId
      ? await supabase.from("account_inventory").update(payload).eq("id", editingAccountId)
      : await supabase.from("account_inventory").insert(payload);
    button.disabled = false;
    if (result.error) {
      setMessage($("accountsMessage"), "Hesap kaydedilemedi: " + result.error.message, true);
      return;
    }
    resetAccountForm();
    await loadAccounts();
  });

  $("cancelAccountEdit").addEventListener("click", resetAccountForm);


  async function loadOverview() {
    setMessage($("overviewMessage"), "Özet bilgiler yükleniyor…");
    const countQuery = async (table, query) => {
      let request = supabase.from(table).select("id", { count: "exact", head: true });
      if (query) request = query(request);
      const result = await request;
      if (result.error) throw result.error;
      return result.count || 0;
    };

    const results = await Promise.allSettled([
      countQuery("tickets", q => q.is("archived_at", null)),
      countQuery("posts"),
      countQuery("account_inventory"),
      countQuery("site_versions")
    ]);
    const ids = ["overviewTickets", "overviewPosts", "overviewAccounts", "overviewVersions"];
    results.forEach((result, index) => {
      $(ids[index]).textContent = result.status === "fulfilled" ? result.value : "—";
    });

    const [tickets, posts] = await Promise.allSettled([
      supabase.from("tickets").select("id,ticket_number,name,status,created_at").is("archived_at", null).order("created_at", { ascending: false }).limit(5),
      supabase.from("posts").select("id,title,slug,created_at").order("created_at", { ascending: false }).limit(5)
    ]);

    const ticketList = $("overviewRecentTickets");
    ticketList.replaceChildren();
    if (tickets.status === "fulfilled" && !tickets.value.error) {
      const rows = tickets.value.data || [];
      if (!rows.length) ticketList.append(makeElement("p", "admin-muted", "Henüz destek talebi yok."));
      rows.forEach(ticket => {
        const item = makeElement("div", "admin-overview-item");
        const info = document.createElement("div");
        info.append(
          makeElement("strong", "", "#" + ticket.ticket_number + " · " + (ticket.name || "İsimsiz kullanıcı")),
          makeElement("span", "admin-muted", formatDate(ticket.created_at))
        );
        const status = makeElement("span", "admin-overview-status", STATUS_LABELS[ticket.status] || ticket.status);
        item.append(info, status);
        ticketList.append(item);
      });
    } else {
      ticketList.append(makeElement("p", "admin-muted", "Destek talepleri şu anda yüklenemedi."));
    }

    const postList = $("overviewRecentPosts");
    postList.replaceChildren();
    if (posts.status === "fulfilled" && !posts.value.error) {
      const rows = posts.value.data || [];
      if (!rows.length) postList.append(makeElement("p", "admin-muted", "Henüz blog yazısı yok."));
      rows.forEach(post => {
        const item = makeElement("div", "admin-overview-item");
        const info = document.createElement("div");
        info.append(
          makeElement("strong", "", post.title || "Başlıksız yazı"),
          makeElement("span", "admin-muted", formatDate(post.created_at))
        );
        const link = makeElement("a", "admin-overview-link", `“${post.title || "Başlıksız yazı"}” yazısını görüntüle ↗`);
        link.href = "blog.html?slug=" + encodeURIComponent(post.slug || "");
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        item.append(info, link);
        postList.append(item);
      });
    } else {
      postList.append(makeElement("p", "admin-muted", "Blog yazıları şu anda yüklenemedi."));
    }

    $("overviewUpdated").textContent = "Güncellendi: " + new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    const failures = results.filter(result => result.status === "rejected").length;
    setMessage($("overviewMessage"), failures ? "Bazı özet sayaçları yüklenemedi. İlgili bölümün SQL ve erişim izinlerini kontrol et." : "Kontrol merkezi güncel.");
  }

  function switchView(viewId) {
    activeView = viewId;
    document.querySelectorAll(".admin-panel-view").forEach(view => view.classList.toggle("hidden", view.id !== viewId));
    document.querySelectorAll(".admin-tab").forEach(tab => tab.classList.toggle("is-active", tab.dataset.view === viewId));
    if (viewId === "overviewView") loadOverview();
    if (viewId === "ticketsView") loadTicketList(false);
    if (viewId === "archiveView") loadTicketList(true);
    if (viewId === "versionsView") loadVersions();
    if (viewId === "developmentView") loadDevelopmentEntries();
    if (viewId === "projectsView") loadProjectsAdmin();
    if (viewId === "accountsView") loadAccounts();
    if (viewId === "editorsView") loadEditors();
    if (viewId === "blogView") {
      // Blog manager is mounted directly in this page and shares the admin session.
    }
  }

 
  async function callEditorManager(action, payload = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Yönetici oturumu bulunamadı. Yeniden giriş yap.");
    const response = await fetch(SUPABASE_URL + "/functions/v1/manage-blog-editors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + session.access_token,
        "apikey": SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Editör işlemi tamamlanamadı.");
    return result;
  }

  async function loadEditors() {
    const list = $("editorList");
    setMessage($("editorsMessage"), "Editörler yükleniyor…");
    list.replaceChildren();
    try {
      const result = await callEditorManager("list");
      if (!result.editors?.length) {
        list.append(makeElement("div", "card admin-empty", "Henüz editör eklenmemiş. Yukarıdan e-posta adresiyle davet gönderebilirsin."));
      } else {
        result.editors.forEach(editor => {
          const card = makeElement("article", "card admin-account-card");
          const details = makeElement("div", "admin-account-details");
          details.append(
            makeElement("h3", "", editor.email || "E-posta bilgisi bulunamadı"),
            makeElement("p", "admin-muted", "Durum: " + (editor.confirmed ? "E-posta doğrulandı" : "Davet bekliyor"))
          );
          const actions = makeElement("div", "admin-account-actions");
          const resend = makeElement("button", "btn btn-secondary admin-small-button", "Yeni bağlantı gönder");
          resend.type = "button";
          resend.addEventListener("click", async () => {
            resend.disabled = true;
            try {
              const result = await callEditorManager("resend", { email: editor.email });
              setMessage($("editorsMessage"), result.message || "Yeni bağlantı gönderildi.");
            } catch (error) {
              setMessage($("editorsMessage"), "Yeni bağlantı gönderilemedi: " + error.message, true);
            } finally {
              resend.disabled = false;
            }
          });
          const revoke = makeElement("button", "btn btn-danger admin-small-button", "Yetkiyi kaldır");
          revoke.type = "button";
          revoke.addEventListener("click", async () => {
            if (!window.confirm((editor.email || "Bu kullanıcının") + " editör yetkisi kaldırılsın mı?")) return;
            revoke.disabled = true;
            try {
              await callEditorManager("revoke", { userId: editor.userId });
              await loadEditors();
              setMessage($("editorsMessage"), "Editör yetkisi kaldırıldı.");
            } catch (error) {
              setMessage($("editorsMessage"), error.message, true);
              revoke.disabled = false;
            }
          });
          actions.append(resend, revoke);
          card.append(details, actions);
          list.append(card);
        });
      }
      setMessage($("editorsMessage"), result.editors?.length ? result.editors.length + " editör listelendi." : "Editör listesi boş.");
    } catch (error) {
      setMessage($("editorsMessage"), "Editörler yüklenemedi: " + error.message, true);
    }
  }

  $("editorInviteForm").addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("editorInviteEmail").value.trim().toLowerCase();
    const button = $("editorInviteButton");
    button.disabled = true;
    button.textContent = "Davet gönderiliyor…";
    setMessage($("editorsMessage"), "");
    try {
      const result = await callEditorManager("invite", { email });
      $("editorInviteForm").reset();
      setMessage($("editorsMessage"), result.message || "Davet e-postası gönderildi.");
      await loadEditors();
    } catch (error) {
      setMessage($("editorsMessage"), "Davet gönderilemedi: " + error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Davet gönder";
    }
  });

  $("editorPasswordForm").addEventListener("submit", async event => {
    event.preventDefault();
    const password = $("editorPassword").value;
    const confirmation = $("editorPasswordConfirm").value;
    const button = $("editorPasswordButton");
    if (password.length < 10 || password.length > 128) {
      setMessage($("editorsMessage"), "Şifre 10-128 karakter arasında olmalı.", true);
      return;
    }
    if (password !== confirmation) {
      setMessage($("editorsMessage"), "Şifreler eşleşmiyor.", true);
      return;
    }
    if (!window.confirm("Yalnızca ipekkaan42@gmail.com hesabının şifresi değiştirilecek. Devam edilsin mi?")) return;
    button.disabled = true;
    button.textContent = "Güncelleniyor…";
    try {
      const result = await callEditorManager("set-editor-password", { password });
      $("editorPasswordForm").reset();
      setMessage($("editorsMessage"), result.message || "Editör şifresi güncellendi.");
    } catch (error) {
      setMessage($("editorsMessage"), "Şifre güncellenemedi: " + error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Editör şifresini güncelle";
    }
  });

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


  const DEVELOPMENT_CATEGORIES = {
    learning: "Öğrenme", project: "Proje", event: "Etkinlik",
    milestone: "Kilometre taşı", experience: "Deneyim"
  };

  function resetDevelopmentForm() {
    editingDevelopmentId = null;
    $("developmentForm").reset();
    $("developmentDate").value = new Date().toISOString().slice(0, 10);
    $("developmentPublished").checked = true;
    $("developmentFormTitle").textContent = "Yeni kayıt ekle";
    $("saveDevelopmentButton").textContent = "Kaydı ekle";
    $("cancelDevelopmentEdit").classList.add("hidden");
  }

  async function loadDevelopmentEntries() {
    const list = $("developmentAdminList");
    setMessage($("developmentMessage"), "Gelişim kayıtları yükleniyor…");
    list.replaceChildren();
    const { data, error } = await supabase.from("development_entries")
      .select("id,title,category,summary,details,event_date,link_url,is_published,created_at")
      .order("event_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) {
      list.append(makeElement("div", "card admin-empty", "Gelişim günlüğü tablosu henüz hazır değil. Önce supabase/development-journal.sql dosyasını Supabase SQL Editor'de çalıştır."));
      setMessage($("developmentMessage"), "Veriler yüklenemedi: " + error.message, true);
      return;
    }
    if (!data?.length) {
      list.append(makeElement("div", "card admin-empty", "Henüz gelişim kaydı yok. İlk kaydını yukarıdaki formdan ekleyebilirsin."));
    } else {
      data.forEach(entry => {
        const card = makeElement("article", "card admin-development-card");
        const head = makeElement("div", "admin-development-card-head");
        const info = document.createElement("div");
        info.append(
          makeElement("h3", "", entry.title),
          makeElement("p", "admin-muted", (DEVELOPMENT_CATEGORIES[entry.category] || entry.category) + " · " +
            new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(new Date(entry.event_date)))
        );
        const state = makeElement("span", entry.is_published ? "admin-current-badge" : "admin-priority", entry.is_published ? "Yayında" : "Taslak");
        head.append(info, state);
        const summary = makeElement("p", "admin-development-summary", entry.summary);
        const actions = makeElement("div", "admin-development-actions");
        const edit = makeElement("button", "btn btn-secondary admin-small-button", "Düzenle");
        edit.type = "button";
        edit.addEventListener("click", () => {
          editingDevelopmentId = entry.id;
          $("developmentTitle").value = entry.title || "";
          $("developmentCategory").value = entry.category || "learning";
          $("developmentDate").value = entry.event_date || "";
          $("developmentSummary").value = entry.summary || "";
          $("developmentDetails").value = entry.details || "";
          $("developmentLink").value = entry.link_url || "";
          $("developmentPublished").checked = Boolean(entry.is_published);
          $("developmentFormTitle").textContent = "Kaydı düzenle";
          $("saveDevelopmentButton").textContent = "Değişiklikleri kaydet";
          $("cancelDevelopmentEdit").classList.remove("hidden");
          $("developmentForm").scrollIntoView({ behavior: "smooth", block: "start" });
        });
        const toggle = makeElement("button", "btn btn-secondary admin-small-button", entry.is_published ? "Yayından kaldır" : "Yayınla");
        toggle.type = "button";
        toggle.addEventListener("click", async () => {
          toggle.disabled = true;
          const { error: updateError } = await supabase.from("development_entries")
            .update({ is_published: !entry.is_published }).eq("id", entry.id);
          if (updateError) setMessage($("developmentMessage"), "Yayın durumu değiştirilemedi: " + updateError.message, true);
          await loadDevelopmentEntries();
        });
        const remove = makeElement("button", "btn btn-danger admin-small-button", "Sil");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          if (!window.confirm('"' + entry.title + '" kaydı kalıcı olarak silinsin mi?')) return;
          remove.disabled = true;
          const { error: deleteError } = await supabase.from("development_entries").delete().eq("id", entry.id);
          if (deleteError) setMessage($("developmentMessage"), "Kayıt silinemedi: " + deleteError.message, true);
          await loadDevelopmentEntries();
        });
        actions.append(edit, toggle, remove);
        card.append(head, summary, actions);
        list.append(card);
      });
    }
    setMessage($("developmentMessage"), data?.length ? data.length + " kayıt listelendi." : "Gelişim günlüğü hazır.");
  }

  $("developmentDate").value = new Date().toISOString().slice(0, 10);
  $("developmentForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("saveDevelopmentButton");
    const title = $("developmentTitle").value.trim();
    const category = $("developmentCategory").value;
    const summary = $("developmentSummary").value.trim();
    const details = $("developmentDetails").value.trim();
    const linkUrl = $("developmentLink").value.trim() || null;
    if (linkUrl && !/^https:\/\//i.test(linkUrl)) {
      setMessage($("developmentMessage"), "Bağlantı https:// ile başlamalı.", true);
      return;
    }
    button.disabled = true;
    const payload = {
      title, category, event_date: $("developmentDate").value,
      summary, details: details || null, link_url: linkUrl,
      is_published: $("developmentPublished").checked
    };
    const result = editingDevelopmentId
      ? await supabase.from("development_entries").update(payload).eq("id", editingDevelopmentId)
      : await supabase.from("development_entries").insert(payload);
    button.disabled = false;
    if (result.error) {
      setMessage($("developmentMessage"), "Kayıt kaydedilemedi: " + result.error.message, true);
      return;
    }
    resetDevelopmentForm();
    setMessage($("developmentMessage"), "Gelişim kaydı kaydedildi.");
    await loadDevelopmentEntries();
  });
  $("cancelDevelopmentEdit").addEventListener("click", resetDevelopmentForm);

  let editingProjectId = null;
  function resetProjectForm() {
    editingProjectId = null;
    $("projectForm").reset();
    $("projectSortOrder").value = "0";
    $("projectPublished").checked = true;
    $("projectFormTitle").textContent = "Yeni proje ekle";
    $("saveProjectButton").textContent = "Projeyi kaydet";
    $("cancelProjectEdit").classList.add("hidden");
  }
  function safeProjectUrl(value) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const url = new URL(trimmed);
      return url.protocol === "https:" ? url.href : null;
    } catch (_) { return null; }
  }
  async function loadProjectsAdmin() {
    const list = $("projectAdminList");
    setMessage($("projectsMessage"), "Projeler yükleniyor…");
    list.replaceChildren();
    const { data, error } = await supabase.from("portfolio_projects")
      .select("id,title_tr,title_en,description_tr,description_en,category,technologies,github_url,live_url,sort_order,is_published,created_at")
      .order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    if (error) {
      list.append(makeElement("div", "card admin-empty", "Proje tablosu hazır değil. Önce supabase/portfolio-projects.sql dosyasını Supabase SQL Editor'de çalıştır."));
      setMessage($("projectsMessage"), "Projeler yüklenemedi: " + error.message, true);
      return;
    }
    if (!data?.length) list.append(makeElement("div", "card admin-empty", "Henüz proje yok. İlk projeni yukarıdaki formdan ekleyebilirsin."));
    data?.forEach(project => {
      const card = makeElement("article", "card admin-project-card");
      const head = makeElement("div", "admin-project-card-head");
      const info = document.createElement("div");
      info.append(makeElement("h3", "", project.title_tr), makeElement("p", "admin-muted", project.category + " · Sıra: " + project.sort_order));
      head.append(info, makeElement("span", project.is_published ? "admin-current-badge" : "admin-priority", project.is_published ? "Yayında" : "Taslak"));
      const description = makeElement("p", "admin-project-summary", project.description_tr);
      const tech = makeElement("p", "admin-muted", (project.technologies || []).join(" · "));
      const actions = makeElement("div", "admin-project-actions");
      const edit = makeElement("button", "btn btn-secondary admin-small-button", "Düzenle");
      edit.type = "button";
      edit.addEventListener("click", () => {
        editingProjectId = project.id;
        $("projectTitleTr").value = project.title_tr || "";
        $("projectTitleEn").value = project.title_en || "";
        $("projectCategory").value = project.category || "";
        $("projectDescriptionTr").value = project.description_tr || "";
        $("projectDescriptionEn").value = project.description_en || "";
        $("projectTechnologies").value = (project.technologies || []).join(", ");
        $("projectGithubUrl").value = project.github_url || "";
        $("projectLiveUrl").value = project.live_url || "";
        $("projectSortOrder").value = project.sort_order ?? 0;
        $("projectPublished").checked = Boolean(project.is_published);
        $("projectFormTitle").textContent = "Projeyi düzenle";
        $("saveProjectButton").textContent = "Değişiklikleri kaydet";
        $("cancelProjectEdit").classList.remove("hidden");
        $("projectForm").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      const toggle = makeElement("button", "btn btn-secondary admin-small-button", project.is_published ? "Yayından kaldır" : "Yayınla");
      toggle.type = "button";
      toggle.addEventListener("click", async () => {
        toggle.disabled = true;
        const { error: updateError } = await supabase.from("portfolio_projects").update({ is_published: !project.is_published }).eq("id", project.id);
        if (updateError) setMessage($("projectsMessage"), "Yayın durumu değiştirilemedi: " + updateError.message, true);
        await loadProjectsAdmin();
      });
      const remove = makeElement("button", "btn btn-danger admin-small-button", "Sil");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!window.confirm('"' + project.title_tr + '" projesi kalıcı olarak silinsin mi?')) return;
        remove.disabled = true;
        const { error: deleteError } = await supabase.from("portfolio_projects").delete().eq("id", project.id);
        if (deleteError) setMessage($("projectsMessage"), "Proje silinemedi: " + deleteError.message, true);
        await loadProjectsAdmin();
      });
      actions.append(edit, toggle, remove);
      card.append(head, description, tech, actions);
      list.append(card);
    });
    setMessage($("projectsMessage"), (data?.length || 0) + " proje listelendi.");
  }
  $("projectForm").addEventListener("submit", async event => {
    event.preventDefault();
    const githubUrl = safeProjectUrl($("projectGithubUrl").value);
    const liveUrl = safeProjectUrl($("projectLiveUrl").value);
    if ($("projectGithubUrl").value.trim() && !githubUrl) {
      setMessage($("projectsMessage"), "GitHub bağlantısı geçerli bir HTTPS adresi olmalı.", true); return;
    }
    if ($("projectLiveUrl").value.trim() && !liveUrl) {
      setMessage($("projectsMessage"), "Canlı demo bağlantısı geçerli bir HTTPS adresi olmalı.", true); return;
    }
    const technologies = $("projectTechnologies").value.split(",").map(value => value.trim()).filter(Boolean).slice(0, 12);
    if (!technologies.length) {
      setMessage($("projectsMessage"), "En az bir teknoloji etiketi ekle.", true); return;
    }
    const payload = {
      title_tr: $("projectTitleTr").value.trim(),
      title_en: $("projectTitleEn").value.trim(),
      description_tr: $("projectDescriptionTr").value.trim(),
      description_en: $("projectDescriptionEn").value.trim(),
      category: $("projectCategory").value.trim(),
      technologies,
      github_url: githubUrl,
      live_url: liveUrl,
      sort_order: Number($("projectSortOrder").value),
      is_published: $("projectPublished").checked
    };
    const button = $("saveProjectButton");
    button.disabled = true;
    const result = editingProjectId
      ? await supabase.from("portfolio_projects").update(payload).eq("id", editingProjectId)
      : await supabase.from("portfolio_projects").insert(payload);
    button.disabled = false;
    if (result.error) {
      setMessage($("projectsMessage"), "Proje kaydedilemedi: " + result.error.message, true); return;
    }
    resetProjectForm();
    setMessage($("projectsMessage"), "Proje kaydedildi.");
    await loadProjectsAdmin();
  });
  $("cancelProjectEdit").addEventListener("click", resetProjectForm);


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
    if (error) {
      const details = [error.message, error.code ? "Kod: " + error.code : "", error.status ? "HTTP: " + error.status : ""].filter(Boolean).join(" · ");
      setMessage(loginMessage, "Giriş başarısız: " + details, true);
    }
    else {
      const access = await routeAuthorizedSession(data.session);
      if (access === "admin") {
        announceAdminSession(data.session);
        showDashboard(true);
        try {
          await Promise.all([loadStats(), loadOverview()]);
        } catch (err) {
          setMessage($("ticketsMessage"), "Panel verileri yüklenemedi: " + err.message, true);
        }
      } else if (access === "none") {
        setMessage(loginMessage, "Bu hesap için blog editör yetkisi bulunamadı.", true);
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
      if (activeView === "overviewView") {
        await Promise.all([loadStats(), loadOverview()]);
      } else if (activeView === "accountsView") {
        await Promise.all([loadStats(), loadAccounts()]);
      } else if (activeView === "developmentView") {
        await loadDevelopmentEntries();
      } else if (activeView === "projectsView") {
        await loadProjectsAdmin();
      } else if (activeView === "editorsView") {
        await loadEditors();
      } else if (activeView === "blogView") {
        window.dispatchEvent(new Event("vki:refresh-blog"));
        await loadStats();
      } else {
        await Promise.all([loadStats(), activeView === "versionsView" ? loadVersions() : loadTickets()]);
      }
    } catch (err) {
      setMessage($(activeView === "archiveView" ? "archiveMessage" : activeView === "versionsView" ? "versionsMessage" : "ticketsMessage"), err.message, true);
    }
  });
  document.querySelectorAll(".admin-tab").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  document.querySelectorAll("[data-open-view]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.openView)));
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
  supabase = window.vkiSupabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  window.vkiSupabaseClient = supabase;
  supabase.auth.getSession().then(async ({ data, error }) => {
    if (error) throw error;
    const access = await routeAuthorizedSession(data.session);
    if (access === "admin") {
      announceAdminSession(data.session);
      showDashboard(true);
      await Promise.all([loadStats(), loadOverview()]);
    }
  }).catch(error => setMessage(loginMessage, "Oturum kontrol edilemedi: " + error.message, true));
})();
(() => {
  "use strict";

  // Supabase Dashboard > Project Settings > API: use Project URL + publishable/anon key.
  // Never place a service_role or secret key in browser code.
  const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
  const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
  const ADMIN_UID = "03347b3f-833f-4ff0-97d0-2dd1e4348b3f";

  document.addEventListener("DOMContentLoaded", initSupabaseBlog);

  async function initSupabaseBlog() {
    const listEl = document.getElementById("blog-list");
    if (!listEl) return;

    const statusEl = document.getElementById("blog-status");
    const detailEl = document.getElementById("blog-detail");
    const filtersEl = document.getElementById("blog-filters");
    const loginPanel = document.getElementById("admin-login-panel");
    const loginForm = document.getElementById("admin-login-form");
    const loginToggle = document.getElementById("adminLoginToggle");
    const loginCancel = document.getElementById("adminLoginCancel");
    const logoutButton = document.getElementById("adminLogout");
    const addButton = document.getElementById("newPostToggle");
    const formPanel = document.getElementById("blog-form-panel");
    const postForm = document.getElementById("blog-post-form");
    const copyButton = document.getElementById("copyPostsJson");
    const categorySelect = document.getElementById("postCategory");
    const customCategory = document.getElementById("customPostCategory");
    const titleInput = document.getElementById("postTitle");
    const readTimeInput = document.getElementById("postReadTime");
    const summaryInput = document.getElementById("postSummary");
    const contentInput = document.getElementById("postContent");

    let supabaseClient = null;
    let basePosts = [];
    let databasePosts = [];
    let posts = [];
    let activeCategory = "Tümü";
    let editingId = null;
    let isAdmin = false;

    const setStatus = (message, isError = false) => {
      statusEl.textContent = message;
      statusEl.classList.toggle("is-error", isError);
    };
    const escape = (value = "") => String(value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
    const slugify = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "yazi";
    const normalize = (p) => ({
      ...p,
      slug: p.slug || slugify(p.title || ""),
      date: p.date || (p.created_at ? p.created_at.slice(0, 10) : ""),
      readTime: p.readTime || p.read_time || "3 dk",
      summary: p.summary || p.excerpt || "",
      content: Array.isArray(p.content) ? p.content : String(p.content || "").split(/\n\s*\n/).filter(Boolean)
    });
    const merge = (...groups) => {
      const map = new Map();
      groups.flat().map(normalize).forEach(p => {
        if (p.slug) map.set(p.slug, { ...(map.get(p.slug) || {}), ...p });
      });
      return [...map.values()].sort((a,b) => String(b.date).localeCompare(String(a.date)));
    };
    const updateAdminUI = () => {
      [addButton, copyButton, logoutButton].forEach(el => el?.classList.toggle("hidden", !isAdmin));
      loginToggle?.classList.toggle("hidden", isAdmin);
      loginPanel?.classList.add("hidden");
      if (!isAdmin) {
        formPanel?.classList.add("hidden");
        addButton?.setAttribute("aria-expanded", "false");
      }
    };

    function renderFilters() {
      const categories = ["Tümü", ...new Set(posts.map(p => p.category).filter(Boolean))];
      filtersEl.innerHTML = "";
      categories.forEach(category => {
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
      detailEl.classList.remove("hidden");
      detailEl.innerHTML = `
        <button type="button" id="back-to-list" class="back-btn">← Tüm Yazılara Dön</button>
        <div class="blog-meta"><span>${escape(post.category)}</span><span>${escape(post.date)}</span><span>${escape(post.readTime)}</span></div>
        <h2>${escape(post.title)}</h2>
        ${post.content.map(p => `<p>${escape(p)}</p>`).join("")}`;
      document.getElementById("back-to-list")?.addEventListener("click", () => {
        detailEl.classList.add("hidden");
        detailEl.innerHTML = "";
      });
      detailEl.scrollIntoView({behavior:"smooth",block:"start"});
    }

    function renderList() {
      const filtered = activeCategory === "Tümü" ? posts : posts.filter(p => p.category === activeCategory);
      listEl.innerHTML = "";
      if (!filtered.length) {
        listEl.innerHTML = "<p>Bu kategoride henüz yazı yok.</p>";
        return;
      }
      filtered.forEach(post => {
        const card = document.createElement("article");
        card.className = "blog-card";
        card.innerHTML = `
          <div class="blog-meta"><span>${escape(post.category)}</span><span>${escape(post.date)}</span><span>${escape(post.readTime)}</span></div>
          <h3>${escape(post.title)}</h3><p>${escape(post.summary)}</p>
          <button type="button" class="read-btn">Yazıyı Oku →</button>
          ${isAdmin && post.id ? `<div class="blog-card-admin-actions">
            <button type="button" data-action="edit">Düzenle</button>
            <button type="button" data-action="delete">Sil</button>
          </div>` : ""}`;
        card.querySelector(".read-btn").addEventListener("click", () => openPost(post));
        if (isAdmin && post.id) {
          card.querySelector('[data-action="edit"]')?.addEventListener("click", () => beginEdit(post));
          card.querySelector('[data-action="delete"]')?.addEventListener("click", () => deletePost(post));
        }
        listEl.appendChild(card);
      });
    }

    function beginEdit(post) {
      editingId = post.id;
      titleInput.value = post.title;
      categorySelect.value = ["DevOps & Altyapı","SAP & Sistem","İHA & Simülasyon"].includes(post.category) ? post.category : "custom";
      customCategory.value = categorySelect.value === "custom" ? post.category : "";
      customCategory.classList.toggle("hidden", categorySelect.value !== "custom");
      customCategory.disabled = categorySelect.value !== "custom";
      readTimeInput.value = post.readTime;
      summaryInput.value = post.summary;
      contentInput.value = post.content.join("\n\n");
      document.getElementById("blog-form-title").textContent = "Blog Yazısını Düzenle";
      formPanel.classList.remove("hidden");
      addButton.setAttribute("aria-expanded","true");
      detailEl.classList.add("hidden");
      formPanel.scrollIntoView({behavior:"smooth",block:"start"});
    }

    function resetEditor() {
      editingId = null;
      postForm.reset();
      document.getElementById("blog-form-title").textContent = "Yeni Blog Yazısı";
      customCategory.classList.add("hidden");
      customCategory.disabled = true;
    }

    async function loadPosts() {
      const jsonResponse = await fetch("posts.json");
      if (jsonResponse.ok) {
        const json = await jsonResponse.json();
        if (Array.isArray(json)) basePosts = json;
      }
      if (supabaseClient) {
        const {data,error} = await supabaseClient.from("posts").select("*").order("created_at",{ascending:false});
        if (error) throw error;
        databasePosts = (data || []).map(normalize);
      }
      posts = merge(basePosts, databasePosts);
      renderFilters();
      renderList();
    }

    async function deletePost(post) {
      if (!confirm(`“${post.title}” yazısını silmek istediğine emin misin?`)) return;
      const {error} = await supabaseClient.from("posts").delete().eq("id",post.id);
      if (error) { setStatus("Yazı silinemedi: " + error.message,true); return; }
      databasePosts = databasePosts.filter(p => p.id !== post.id);
      posts = merge(basePosts,databasePosts);
      renderFilters(); renderList();
      setStatus("Yazı Supabase veritabanından silindi.");
    }

    loginToggle?.addEventListener("click", () => loginPanel.classList.toggle("hidden"));
    loginCancel?.addEventListener("click", () => loginPanel.classList.add("hidden"));
    loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!supabaseClient) return setStatus("Önce Supabase URL ve public key ayarlanmalı.",true);
      const email = document.getElementById("adminEmail").value.trim();
      const password = document.getElementById("adminPassword").value;
      const {data,error} = await supabaseClient.auth.signInWithPassword({email,password});
      if (error) { setStatus("Giriş başarısız: " + error.message,true); return; }
      if (data.user?.id !== ADMIN_UID) {
        await supabaseClient.auth.signOut();
        setStatus("Bu hesap blog yöneticisi olarak yetkili değil.",true);
        return;
      }
      isAdmin = true;
      updateAdminUI();
      setStatus("Yönetici girişi başarılı.");
      await loadPosts();
    });

    logoutButton?.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      isAdmin = false;
      updateAdminUI();
      resetEditor();
      setStatus("Oturum kapatıldı.");
      renderList();
    });

    addButton?.addEventListener("click", () => {
      const opening = formPanel.classList.contains("hidden");
      formPanel.classList.toggle("hidden",!opening);
      addButton.setAttribute("aria-expanded",String(opening));
      if (opening) {
        resetEditor();
        titleInput.focus();
      }
    });
    document.getElementById("cancelPostForm")?.addEventListener("click", () => {
      formPanel.classList.add("hidden");
      addButton.setAttribute("aria-expanded","false");
      resetEditor();
    });
    categorySelect?.addEventListener("change", () => {
      const custom = categorySelect.value === "custom";
      customCategory.classList.toggle("hidden",!custom);
      customCategory.disabled = !custom;
      customCategory.required = custom;
      if (custom) customCategory.focus();
    });

    postForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!isAdmin || !supabaseClient) return setStatus("Yazı kaydetmek için yönetici girişi yapmalısın.",true);
      const title = titleInput.value.trim();
      const category = categorySelect.value === "custom" ? customCategory.value.trim() : categorySelect.value;
      const readTime = readTimeInput.value.trim();
      const summary = summaryInput.value.trim();
      const content = contentInput.value.split(/\r?\n\s*\r?\n/).map(s=>s.trim()).filter(Boolean);
      if (!title || !category || !readTime || !summary || !content.length) return setStatus("Lütfen tüm alanları doldur.",true);
      const payload = {
        title, slug: slugify(title), category, read_time: readTime,
        excerpt: summary, content: content.join("\n\n"), author: "Veysel Kaan İpek"
      };
      const query = editingId
        ? supabaseClient.from("posts").update(payload).eq("id",editingId)
        : supabaseClient.from("posts").insert(payload);
      const {error} = await query;
      if (error) { setStatus("Yazı kaydedilemedi: " + error.message,true); return; }
      formPanel.classList.add("hidden");
      addButton.setAttribute("aria-expanded","false");
      resetEditor();
      await loadPosts();
      setStatus(editingId ? "Yazı güncellendi." : "Yazı Supabase'e kaydedildi.");
    });

    copyButton?.addEventListener("click", async () => {
      const output = JSON.stringify(posts,null,2);
      try {
        await navigator.clipboard.writeText(output);
        setStatus("Yazıların JSON çıktısı panoya kopyalandı.");
      } catch { setStatus("Panoya kopyalama başarısız oldu.",true); }
    });

    if (SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") &&
        SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("YOUR_") && window.supabase?.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
      const {data:{session}} = await supabaseClient.auth.getSession();
      isAdmin = session?.user?.id === ADMIN_UID;
      if (session && !isAdmin) await supabaseClient.auth.signOut();
      updateAdminUI();
      try {
        await loadPosts();
        if (isAdmin) setStatus("Yönetici oturumu açık.");
      } catch (error) {
        setStatus("Supabase bağlantısı kurulamadı: " + error.message,true);
        try {
          const response = await fetch("posts.json");
          basePosts = await response.json();
          posts = merge(basePosts);
          renderFilters(); renderList();
        } catch { listEl.innerHTML = "<p>Blog yazıları şu anda yüklenemedi.</p>"; }
      }
    } else {
      updateAdminUI();
      try {
        const response = await fetch("posts.json");
        basePosts = await response.json();
        posts = merge(basePosts);
        renderFilters(); renderList();
        setStatus("Supabase bağlantı bilgileri henüz eklenmedi. Şu an yerel blog yazıları gösteriliyor.");
      } catch {
        setStatus("Supabase bağlantı bilgileri eksik ve posts.json yüklenemedi.",true);
      }
    }
  }
})();
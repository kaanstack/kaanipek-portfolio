(() => {
  "use strict";

  const SUPABASE_URL = "https://dkhkvpspgniygdqgwtyh.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_MPa3mW5WwmD3eVt_PI2X2Q_tqVCYhmd";
  const ADMIN_UID = "03347b3f-833f-4ff0-97d0-2dd1e4348b3f";
  const STORAGE_BUCKET = "blog-covers";
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  const SITE_URL = "https://kaanipek.net.tr";

  document.addEventListener("DOMContentLoaded", initSupabaseBlog);

  async function initSupabaseBlog() {
    const listEl = document.getElementById("blog-list");
    if (!listEl) return;

    const statusEl = document.getElementById("blog-status");
    const detailEl = document.getElementById("blog-detail");
    const filtersEl = document.getElementById("blog-filters");
    const headerEl = document.querySelector(".blog-header");
    const discoveryEl = document.getElementById("blog-discovery");
    const featuredEl = document.getElementById("blog-featured");
    const searchInput = document.getElementById("blog-search");
    const embeddedAdminMode = document.body.dataset.adminBlog === "true";
    const adminMode = embeddedAdminMode || new URLSearchParams(location.search).get("yonetim") === "1";
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
    const coverInput = document.getElementById("coverImageFile");
    const coverPreview = document.getElementById("coverImagePreview");
    const metaDescriptionInput = document.getElementById("metaDescription");

    let supabaseClient = null;
    let databasePosts = [];
    let posts = [];
    let activeCategory = "Tümü";
    let editingId = null;
    let editingPost = null;
    let isAdmin = false;
    let currentObjectUrl = null;

    const setStatus = (message, isError = false) => {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.toggle("is-error", isError);
    };
    const escape = (value = "") => String(value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
    const slugify = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "yazi";
    const safeImageUrl = (value) => {
      try {
        const url = new URL(String(value || ""), SITE_URL);
        return url.protocol === "https:" ? url.href : "";
      } catch { return ""; }
    };

    function attachCoverFallback(image, variant) {
      if (!image) return;
      image.addEventListener("error", () => {
        const fallback = document.createElement("div");
        if (variant === "detail") {
          fallback.className = "blog-detail-cover-fallback";
          fallback.textContent = "VKI / NOTES";
        } else {
          fallback.className = variant === "featured" ? "blog-art-mark" : "blog-card-placeholder";
          fallback.append(document.createTextNode("VKI"));
          const suffix = document.createElement("span");
          suffix.textContent = " / NOTES";
          fallback.append(suffix);
          image.parentElement?.classList.remove("has-cover");
        }
        image.replaceWith(fallback);
      }, { once: true });
    }
    const normalize = (p) => ({
      ...p,
      slug: p.slug || slugify(p.title || ""),
      date: p.date || (p.created_at ? p.created_at.slice(0, 10) : ""),
      readTime: p.readTime || p.read_time || "3 dk",
      summary: p.summary || p.excerpt || "",
      coverImage: p.coverImage || p.cover_image || "",
      metaDescription: p.metaDescription || p.meta_description || "",
      content: Array.isArray(p.content) ? p.content : String(p.content || "").split(/\n\s*\n/).filter(Boolean)
    });
    const sortPosts = (items) => items.map(normalize)
      .sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const absolutePostUrl = (post) => SITE_URL + "/blog/" + encodeURIComponent(post.slug);
    const setMeta = (name, content, attribute = "name") => {
      let element = document.head.querySelector("meta[" + attribute + '="' + name + '"]');
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content || "");
    };
    const setCanonical = (url) => {
      let link = document.head.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = url;
    };
    function updateSeo(post) {
      if (!post) {
        document.title = "Blog — Veysel Kaan İpek";
        const description = "Altyapı, yazılım geliştirme ve mühendislik üzerine teknik notlar.";
        setMeta("description", description);
        setMeta("og:type", "website", "property");
        setMeta("og:title", "Blog — Veysel Kaan İpek", "property");
        setMeta("og:description", description, "property");
        setMeta("og:url", SITE_URL + "/blog.html", "property");
        setMeta("og:image", "", "property");
        setMeta("twitter:card", "summary", "name");
        setCanonical(SITE_URL + "/blog.html");
        return;
      }
      const description = (post.metaDescription || post.summary || "").slice(0, 320);
      document.title = post.title + " | Veysel Kaan İpek";
      setMeta("description", description);
      setMeta("og:type", "article", "property");
      setMeta("og:title", post.title, "property");
      setMeta("og:description", description, "property");
      setMeta("og:url", absolutePostUrl(post), "property");
      setMeta("og:image", safeImageUrl(post.coverImage), "property");
      setMeta("twitter:card", post.coverImage ? "summary_large_image" : "summary", "name");
      setMeta("twitter:title", post.title, "name");
      setMeta("twitter:description", description, "name");
      if (post.coverImage) {
        setMeta("twitter:image", safeImageUrl(post.coverImage), "name");
      } else {
        document.head.querySelector('meta[name="twitter:image"]')?.remove();
      }
      setCanonical(absolutePostUrl(post));
    }
    const updateAdminUI = () => {
      [addButton, copyButton].forEach(el => el?.classList.toggle("hidden", !isAdmin));
      logoutButton?.classList.toggle("hidden", !isAdmin || embeddedAdminMode);
      if (!isAdmin) {
        formPanel?.classList.add("hidden");
        addButton?.setAttribute("aria-expanded", "false");
      }
    };

    function showListRoute(updateHistory = false) {
      if (updateHistory && !embeddedAdminMode && location.pathname !== "/blog.html") {
        history.pushState({}, "", "/blog.html");
      }
      detailEl.classList.add("hidden");
      detailEl.innerHTML = "";
      listEl.classList.remove("hidden");
      filtersEl?.classList.remove("hidden");
      headerEl?.classList.remove("hidden");
      discoveryEl?.classList.remove("hidden");
      featuredEl?.classList.remove("hidden");
      updateSeo(null);
      window.scrollTo({top:0,behavior:"smooth"});
    }

    function renderFilters() {
      if (!filtersEl) return;
      const categories = ["Tümü", ...new Set(posts.map(p => p.category).filter(Boolean))];
      filtersEl.innerHTML = "";
      categories.forEach(category => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "filter-btn " + (category === activeCategory ? "active" : "");
        button.textContent = category;
        button.setAttribute("aria-pressed", String(category === activeCategory));
        button.addEventListener("click", () => {
          activeCategory = category;
          showListRoute(false);
          renderFilters();
          renderList();
        });
        filtersEl.appendChild(button);
      });
    }

    function openPost(post, updateHistory = true) {
      if (updateHistory && !embeddedAdminMode) history.pushState({blogPost:post.slug}, "", "/blog/" + encodeURIComponent(post.slug));
      const cover = safeImageUrl(post.coverImage);
      const paragraphs = post.content.map(p => "<p>" + escape(p) + "</p>").join("");
      detailEl.innerHTML = `
        <button type="button" id="back-to-list" class="back-btn">← Tüm Yazılara Dön</button>
        <div class="blog-meta"><span class="blog-meta-category">${escape(post.category)}</span><span class="blog-meta-date"><span aria-hidden="true">◷</span> ${escape(post.date)}</span><span class="blog-meta-reading"><span aria-hidden="true">↗</span> ${escape(post.readTime)} okuma</span></div>
        <h1>${escape(post.title)}</h1>
        ${cover ? '<img class="blog-detail-cover" src="' + escape(cover) + '" alt="' + escape(post.title) + '" loading="eager">' : ""}
        <p class="blog-detail-summary">${escape(post.summary)}</p>
        <div class="blog-share-row">
          <a href="${escape(absolutePostUrl(post))}">${escape(absolutePostUrl(post))}</a>
          <button type="button" id="copy-post-link">Bağlantıyı Kopyala</button>
        </div>
        <div class="blog-detail-content">${paragraphs}</div>`;
      attachCoverFallback(detailEl.querySelector(".blog-detail-cover"), "detail");
      detailEl.classList.remove("hidden");
      listEl.classList.add("hidden");
      filtersEl?.classList.add("hidden");
      headerEl?.classList.add("hidden");
      discoveryEl?.classList.add("hidden");
      featuredEl?.classList.add("hidden");
      updateSeo(post);
      document.getElementById("back-to-list")?.addEventListener("click", () => showListRoute(true));
      document.getElementById("copy-post-link")?.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(absolutePostUrl(post));
          setStatus("Yazı bağlantısı panoya kopyalandı.");
        } catch { setStatus("Bağlantı kopyalanamadı.", true); }
      });
      window.scrollTo({top:0,behavior:"smooth"});
    }

    function renderFeatured(post) {
      const featuredEl = document.getElementById("blog-featured");
      if (!featuredEl) return;
      const showFeatured = Boolean(post) && activeCategory === "Tümü" && !searchInput?.value.trim();
      featuredEl.classList.toggle("hidden", !showFeatured);
      if (!showFeatured) { featuredEl.innerHTML = ""; return; }
      const cover = safeImageUrl(post.coverImage);
      featuredEl.innerHTML = `
        <article class="blog-featured-card">
          <div class="blog-featured-copy">
            <span class="blog-featured-kicker">ÖNE ÇIKAN YAZI</span>
            <div class="blog-meta"><span class="blog-meta-category">${escape(post.category)}</span><span class="blog-meta-date"><span aria-hidden="true">◷</span> ${escape(post.date)}</span><span class="blog-meta-reading"><span aria-hidden="true">↗</span> ${escape(post.readTime)} okuma</span></div>
            <h2>${escape(post.title)}</h2>
            <p>${escape(post.summary)}</p>
            <button type="button" class="blog-featured-link">Yazıyı keşfet <span aria-hidden="true">↗</span></button>
            ${isAdmin && post.id ? '<div class="blog-card-admin-actions"><button type="button" data-action="edit">Düzenle</button><button type="button" data-action="delete">Sil</button></div>' : ""}
          </div>
          <div class="blog-featured-art ${cover ? "has-cover" : ""}">
            ${cover ? '<img src="' + escape(cover) + '" alt="' + escape(post.title) + '" loading="eager">' : '<div class="blog-art-mark" aria-hidden="true">VKI<span> / NOTES</span></div>'}
            <span class="blog-art-index">FIELD NOTES / 01</span>
          </div>
        </article>`;
      attachCoverFallback(featuredEl.querySelector(".blog-featured-art img"), "featured");
      featuredEl.querySelector(".blog-featured-link")?.addEventListener("click", () => openPost(post));
      if (isAdmin && post.id) {
        featuredEl.querySelector('[data-action="edit"]')?.addEventListener("click", () => beginEdit(post));
        featuredEl.querySelector('[data-action="delete"]')?.addEventListener("click", () => deletePost(post));
      }
    }

    searchInput?.addEventListener("input", renderList);

    function renderList() {
      const query = (searchInput?.value || "").trim().toLocaleLowerCase("tr-TR");
      const categoryPosts = activeCategory === "Tümü" ? posts : posts.filter(p => p.category === activeCategory);
      const featuredPost = categoryPosts[0] || null;
      renderFeatured(featuredPost);
      const filtered = categoryPosts.filter((p, index) => {
        if (!embeddedAdminMode && !query && activeCategory === "Tümü" && index === 0) return false;
        const haystack = [p.title, p.summary, p.category, p.content.join(" ")].join(" ").toLocaleLowerCase("tr-TR");
        return !query || haystack.includes(query);
      });
      const countEl = document.getElementById("blog-post-count");
      if (countEl) countEl.textContent = query || activeCategory !== "Tümü"
        ? filtered.length + " yazı bulundu"
        : posts.length + " yazı";
      listEl.innerHTML = "";
      if (!filtered.length) {
        listEl.innerHTML = '<div class="blog-empty-state"><span>⌕</span><h3>Aradığını bulamadık.</h3><p>Başka bir kelime deneyebilir veya kategori seçimini değiştirebilirsin.</p></div>';
        return;
      }
      filtered.forEach((post, index) => {
        if (embeddedAdminMode) {
          const row = document.createElement("article");
          row.className = "admin-blog-post-row";
          const info = document.createElement("div");
          info.className = "admin-blog-post-info";
          const title = document.createElement("h3");
          title.textContent = post.title;
          const meta = document.createElement("p");
          meta.textContent = [post.category, post.date].filter(Boolean).join(" · ");
          info.append(title, meta);
          const edit = document.createElement("button");
          edit.type = "button";
          edit.className = "btn btn-secondary admin-small-button";
          edit.textContent = "Düzenle";
          edit.addEventListener("click", () => beginEdit(post));
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "btn btn-danger admin-small-button";
          remove.textContent = "Sil";
          remove.addEventListener("click", () => deletePost(post));
          const actions = document.createElement("div");
          actions.className = "admin-blog-post-actions";
          actions.append(edit, remove);
          row.append(info, actions);
          listEl.appendChild(row);
          return;
        }
        const card = document.createElement("article");
        card.className = "blog-card";
        const cover = safeImageUrl(post.coverImage);
        card.innerHTML = `
          <div class="blog-card-media ${cover ? "has-cover" : ""}">
            ${cover ? '<img class="blog-card-cover" src="' + escape(cover) + '" alt="' + escape(post.title) + '" loading="lazy">' : '<span class="blog-card-placeholder" aria-hidden="true">VKI<span> / NOTES</span></span>'}
            <span class="blog-card-number">${String(index + 1).padStart(2,"0")}</span>
          </div>
          <div class="blog-card-body">
            <div class="blog-meta"><span class="blog-meta-category">${escape(post.category)}</span><span class="blog-meta-date"><span aria-hidden="true">◷</span> ${escape(post.date)}</span><span class="blog-meta-reading"><span aria-hidden="true">↗</span> ${escape(post.readTime)} okuma</span></div>
            <h3>${escape(post.title)}</h3><p>${escape(post.summary)}</p>
            <button type="button" class="read-btn">Yazıyı oku <span aria-hidden="true">↗</span></button>
            ${isAdmin && post.id ? '<div class="blog-card-admin-actions"><button type="button" data-action="edit">Düzenle</button><button type="button" data-action="delete">Sil</button></div>' : ""}
          </div>`;
        attachCoverFallback(card.querySelector(".blog-card-cover"), "card");
        card.querySelector(".read-btn").addEventListener("click", () => openPost(post));
        if (isAdmin && post.id) {
          card.querySelector('[data-action="edit"]')?.addEventListener("click", () => beginEdit(post));
          card.querySelector('[data-action="delete"]')?.addEventListener("click", () => deletePost(post));
        }
        listEl.appendChild(card);
      });
    }

    function updateCoverPreview(url) {
      if (!coverPreview) return;
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
      const safe = safeImageUrl(url);
      if (safe) {
        coverPreview.src = safe;
        coverPreview.classList.remove("hidden");
      } else {
        coverPreview.removeAttribute("src");
        coverPreview.classList.add("hidden");
      }
    }

    function beginEdit(post) {
      editingId = post.id;
      editingPost = post;
      titleInput.value = post.title;
      categorySelect.value = ["DevOps & Altyapı","SAP & Sistem","İHA & Simülasyon"].includes(post.category) ? post.category : "custom";
      customCategory.value = categorySelect.value === "custom" ? post.category : "";
      customCategory.classList.toggle("hidden", categorySelect.value !== "custom");
      customCategory.disabled = categorySelect.value !== "custom";
      readTimeInput.value = post.readTime;
      summaryInput.value = post.summary;
      contentInput.value = post.content.join("\n\n");
      metaDescriptionInput.value = post.metaDescription || "";
      coverInput.value = "";
      updateCoverPreview(post.coverImage);
      document.getElementById("blog-form-title").textContent = "Blog Yazısını Düzenle";
      formPanel.classList.remove("hidden");
      addButton.setAttribute("aria-expanded","true");
      detailEl.classList.add("hidden");
      listEl.classList.remove("hidden");
      formPanel.scrollIntoView({behavior:"smooth",block:"start"});
    }

    function resetEditor() {
      editingId = null;
      editingPost = null;
      postForm.reset();
      updateCoverPreview("");
      document.getElementById("blog-form-title").textContent = "Yeni Blog Yazısı";
      customCategory.classList.add("hidden");
      customCategory.disabled = true;
    }

    async function uploadCover(file) {
      if (!file) return editingPost?.coverImage || null;
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error("Yalnızca JPG, PNG, WebP veya AVIF görsel yükleyebilirsin.");
      if (file.size > MAX_IMAGE_SIZE) throw new Error("Kapak görseli 5 MB sınırını aşamaz.");
      const extension = ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/avif":"avif" })[file.type];
      const path = Date.now() + "-" + Math.random().toString(36).slice(2,10) + "." + extension;
      const {error} = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path,file,{
        cacheControl:"3600", upsert:false, contentType:file.type
      });
      if (error) throw error;
      const {data} = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      return data.publicUrl;
    }

    async function loadPosts() {
      if (!supabaseClient) throw new Error("Supabase bağlantısı hazır değil.");
      const {data,error} = await supabaseClient.from("posts").select("*").order("created_at",{ascending:false});
      if (error) throw error;
      databasePosts = data || [];
      posts = sortPosts(databasePosts);
      renderFilters();
      renderList();
      const routeSlug = decodeURIComponent(location.pathname.match(/^\/blog\/([^/]+)\/?$/)?.[1] || new URLSearchParams(location.search).get("slug") || "");
      if (routeSlug) {
        const post = posts.find(p => p.slug === routeSlug);
        if (post) openPost(post, false);
        else {
          showListRoute(false);
          setStatus("Aradığın blog yazısı bulunamadı.", true);
        }
      } else {
        showListRoute(false);
      }
    }

    window.addEventListener("vki:refresh-blog", () => loadPosts().catch(error => setStatus("Blog yenilenemedi: " + error.message, true)));

    async function deletePost(post) {
      if (!confirm("“" + post.title + "” yazısını silmek istediğine emin misin?")) return;
      const {error} = await supabaseClient.from("posts").delete().eq("id",post.id);
      if (error) { setStatus("Yazı silinemedi: " + error.message,true); return; }
      databasePosts = databasePosts.filter(p => p.id !== post.id);
      posts = sortPosts(databasePosts);
      renderFilters(); renderList();
      if (editingId === post.id) resetEditor();
      setStatus("Yazı Supabase veritabanından silindi.");
      if (location.pathname.startsWith("/blog/")) showListRoute(true);
    }

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
      if (opening) { resetEditor(); titleInput.focus(); }
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
    coverInput?.addEventListener("change", () => {
      const file = coverInput.files?.[0];
      if (!file) return updateCoverPreview(editingPost?.coverImage || "");
      if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE) {
        coverInput.value = "";
        setStatus("Görsel JPG, PNG, WebP veya AVIF olmalı ve 5 MB'ı aşmamalı.", true);
        updateCoverPreview(editingPost?.coverImage || "");
        return;
      }
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = URL.createObjectURL(file);
      coverPreview.src = currentObjectUrl;
      coverPreview.classList.remove("hidden");
    });

    postForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!isAdmin || !supabaseClient) return setStatus("Yazı kaydetmek için yönetici girişi yapmalısın.",true);
      const title = titleInput.value.trim();
      const category = categorySelect.value === "custom" ? customCategory.value.trim() : categorySelect.value;
      const readTime = readTimeInput.value.trim();
      const summary = summaryInput.value.trim();
      const content = contentInput.value.split(/\r?\n\s*\r?\n/).map(s=>s.trim()).filter(Boolean);
      const metaDescription = metaDescriptionInput.value.trim() || summary;
      if (!title || !category || !readTime || !summary || !content.length) return setStatus("Lütfen tüm zorunlu alanları doldur.",true);
      const selectedFile = coverInput.files?.[0] || null;
      if (selectedFile && (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type) || selectedFile.size > MAX_IMAGE_SIZE)) {
        return setStatus("Görsel JPG, PNG, WebP veya AVIF olmalı ve 5 MB'ı aşmamalı.",true);
      }
      const wasEditing = Boolean(editingId);
      const saveButton = postForm.querySelector('button[type="submit"]');
      saveButton.disabled = true;
      saveButton.textContent = "Kaydediliyor...";
      try {
        const coverImage = await uploadCover(selectedFile);
        const payload = {
          title, slug: slugify(title), category, read_time: readTime,
          excerpt: summary, content: content.join("\n\n"),
          author: "Veysel Kaan İpek", cover_image: coverImage || null,
          meta_description: metaDescription
        };
        const query = editingId
          ? supabaseClient.from("posts").update(payload).eq("id",editingId)
          : supabaseClient.from("posts").insert(payload);
        const {error} = await query;
        if (error) throw error;
        formPanel.classList.add("hidden");
        addButton.setAttribute("aria-expanded","false");
        resetEditor();
        await loadPosts();
        setStatus(wasEditing ? "Yazı güncellendi." : "Yazı Supabase'e kaydedildi.");
      } catch (error) {
        setStatus("Yazı kaydedilemedi: " + (error.message || "Bilinmeyen hata"),true);
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Yazıyı Kaydet";
      }
    });

    copyButton?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(posts,null,2));
        setStatus("Yazıların JSON çıktısı panoya kopyalandı.");
      } catch { setStatus("Panoya kopyalama başarısız oldu.",true); }
    });

    window.addEventListener("popstate", () => {
      const slug = decodeURIComponent(location.pathname.match(/^\/blog\/([^/]+)\/?$/)?.[1] || new URLSearchParams(location.search).get("slug") || "");
      const post = slug ? posts.find(p => p.slug === slug) : null;
      if (post) openPost(post, false);
      else showListRoute(false);
    });

    if (SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY && window.supabase?.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
      const {data:{session}} = await supabaseClient.auth.getSession();
      isAdmin = adminMode && session?.user?.id === ADMIN_UID;
      if (adminMode && session && session.user?.id !== ADMIN_UID) await supabaseClient.auth.signOut();
      updateAdminUI();
      try {
        await loadPosts();
        if (isAdmin) setStatus("Yönetici oturumu açık.");
      } catch (error) {
        setStatus("Supabase bağlantısı kurulamadı: " + error.message,true);
        listEl.innerHTML = "<p>Blog yazıları şu anda yüklenemedi. Lütfen daha sonra tekrar deneyin.</p>";
      }
    } else {
      updateAdminUI();
      listEl.innerHTML = "<p>Blog servisi şu anda kullanılamıyor.</p>";
      setStatus("Supabase bağlantısı kurulamadı. Lütfen daha sonra tekrar deneyin.",true);
    }
  }
})();
/* script.js - public frontend logic */
(async () => {
  // Helper
  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
  function api(path, opts) {
    return fetch(path, opts).then(r => r.ok ? r.json().catch(()=>null) : Promise.reject(r));
  }

  // Page detection
  const pathname = window.location.pathname;
  const isHome = pathname.endsWith("/") || pathname.endsWith("index.html");
  const isPosts = pathname.endsWith("posts.html");
  const isPostPage = pathname.endsWith("post.html");
  const isAbout = pathname.endsWith("about.html");

  // Load posts and categories for home/posts pages
  async function loadAllPosts() {
    const posts = await api("/api/posts").catch(()=>[]);
    window.__allPosts = posts || [];

    renderCategories(window.__allPosts);
    renderPosts(window.__allPosts);
  }

  function renderCategories(posts) {
    const container = document.querySelector(".category-list");
    if (!container) return;

    const cats = ["All", ...Array.from(new Set(posts.map(p => p.category || "Uncategorized")))];
    container.innerHTML = "";
    cats.forEach(cat => {
      const btn = document.createElement("button");
      btn.className = "category-btn";
      btn.dataset.category = cat;
      btn.textContent = cat;
      container.appendChild(btn);
    });

    container.addEventListener("click", (e) => {
      if (!e.target.classList.contains("category-btn")) return;
      const cat = e.target.dataset.category;
      qsa(".category-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      if (cat === "All") renderPosts(window.__allPosts);
      else renderPosts(window.__allPosts.filter(p => p.category === cat));
    });
  }

  function renderPosts(posts) {
    const container = qs("#posts-container");
    if (!container) return;
    container.innerHTML = "";
    if (!posts || posts.length === 0) {
      container.innerHTML = "<p>No posts yet.</p>";
      return;
    }

    posts.forEach(post => {
      const card = document.createElement("article");
      card.className = "post-card";
      card.innerHTML = `
        <a class="post-link" href="post.html?id=${post.id}">
          <div class="thumb-wrap">
            <img src="${post.mainImage || '/uploads/default.jpg'}" alt="${post.title}" class="post-thumb"/>
          </div>
          <h3>${post.title}</h3>
          <p class="meta">${(post.category || 'Uncategorized')} • ${post.tags?.join(', ') || ''}</p>
          <p class="excerpt">${(post.content || '').replace(/<[^>]+>/g, '').slice(0,150)}...</p>
        </a>
      `;
      container.appendChild(card);
    });
  }

  // Single post page
  async function loadSinglePost() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) { document.body.innerHTML = "<h2>Post ID missing</h2>"; return; }

    const post = await api(`/api/posts/${id}`).catch(()=>null);
    if (!post) { document.body.innerHTML = "<h2>Post not found</h2>"; return; }

    qs("#post-title").textContent = post.title;
    qs("#post-category").textContent = post.category || "Uncategorized";
    document.title = post.title + " | NayMish";

    if (post.mainImage) {
      const img = qs("#post-main-image");
      img.src = post.mainImage;
      img.classList.remove("hidden");
    }

    qs("#post-body").innerHTML = post.content || "";

    // likes
    const likeBtn = qs("#like-btn");
    const likeCount = qs("#like-count");
    likeCount.textContent = (post.likes || []).length;
    likeBtn.addEventListener("click", async () => {
      const data = await fetch(`/api/posts/${post.id}/like`, { method: "POST" }).then(r => r.json()).catch(()=>null);
      if (data) likeCount.textContent = data.likes;
    });

    // comments
    loadCommentsForPost(post.id);

    const form = qs("#comment-form");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = qs("#comment-name").value.trim();
        const text = qs("#comment-text").value.trim();
        if (!text) return alert("Write a comment");
        await fetch(`/api/comments/${post.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, text })
        });
        form.reset();
        loadCommentsForPost(post.id);
      });
    }
  }

  async function loadCommentsForPost(postId) {
    const list = qs("#comments-list");
    if (!list) return;
    const comments = await api(`/api/comments/${postId}`).catch(()=>[]);
    list.innerHTML = "";
    if (!comments.length) {
      list.innerHTML = "<p>No comments yet.</p>";
      return;
    }
    comments.forEach(c => {
      const div = document.createElement("div");
      div.className = "comment-item";
      div.innerHTML = `
        <strong>${c.name}</strong>
        <p>${c.text}</p>
        <small>${new Date(c.createdAt).toLocaleString()}</small>
      `;
      list.appendChild(div);
    });
  }

  // About
  async function loadAbout() {
    const about = await api("/api/about").catch(()=>({ text: "", email: "", social: {} }));
    const at = qs("#about-text");
    const ae = qs("#about-email");
    const as = qs("#about-social");
    if (at) at.innerHTML = about.text || "";
    if (ae) ae.textContent = about.email || "";
    if (as) {
      as.innerHTML = "";
      const social = about.social || {};
      const mapping = {
        youtube: "fa-brands fa-youtube",
        github: "fa-brands fa-github",
        instagram: "fa-brands fa-instagram",
        twitter: "fa-brands fa-twitter",
        linkedin: "fa-brands fa-linkedin",
        email: "fa-solid fa-envelope"
      };
      for (const key of Object.keys(mapping)) {
        const url = social[key];
        if (!url) continue;
        const a = document.createElement("a");
        a.href = key === "email" && !url.startsWith("mailto:") ? `mailto:${url}` : url;
        a.target = "_blank";
        a.className = "social-link";
        a.innerHTML = `<i class="${mapping[key]}"></i>`;
        as.appendChild(a);
      }
    }
  }

  // Run page-specific
  if (isHome || isPosts) await loadAllPosts();
  if (isPostPage) await loadSinglePost();
  if (isAbout) await loadAbout();

})();

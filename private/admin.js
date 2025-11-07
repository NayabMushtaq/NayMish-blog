// private/admin.js - admin panel logic

// Elements
const loginScreen = document.getElementById("login-screen");
const dashboard = document.getElementById("dashboard");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const adminPassInput = document.getElementById("admin-pass");
const loginMsg = document.getElementById("login-msg");

const createPostBtn = document.getElementById("create-post-btn");
const postForm = document.getElementById("post-form");
const savePostBtn = document.getElementById("save-post-btn");
const postsList = document.getElementById("posts-list");

const aboutTextEl = document.getElementById("about-text");
const aboutEmailEl = document.getElementById("about-email");
const socialFields = {
  youtube: document.getElementById("social-youtube"),
  github: document.getElementById("social-github"),
  instagram: document.getElementById("social-instagram"),
  twitter: document.getElementById("social-twitter"),
  linkedin: document.getElementById("social-linkedin"),
  email: document.getElementById("social-email")
};
const saveAboutBtn = document.getElementById("save-about-btn");

const commentsListAdmin = document.getElementById("comments-list-admin");

let adminPass = null; // stored only in memory during session

function adminFetch(path, options = {}) {
  options.headers = options.headers || {};
  if (adminPass) options.headers["x-admin-pass"] = adminPass;
  return fetch(path, options);
}

// Login
loginBtn.addEventListener("click", async () => {
  const pass = adminPassInput.value.trim();
  if (!pass) return loginMsg.textContent = "Enter password";
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pass })
    });
    if (res.ok) {
      adminPass = pass;
      loginMsg.textContent = "";
      showDashboard();
      await loadPosts();
      await loadAbout();
      await loadComments();
    } else {
      loginMsg.textContent = "Incorrect password";
    }
  } catch (err) {
    console.error(err);
    loginMsg.textContent = "Login error";
  }
});

logoutBtn.addEventListener("click", () => {
  adminPass = null;
  hideDashboard();
});

function showDashboard() {
  loginScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

function hideDashboard() {
  loginScreen.classList.remove("hidden");
  dashboard.classList.add("hidden");
  adminPassInput.value = "";
}

// Posts: create
createPostBtn.addEventListener("click", () => postForm.classList.toggle("hidden"));

savePostBtn.addEventListener("click", async () => {
  const title = document.getElementById("post-title").value.trim();
  const content = document.getElementById("post-content").value.trim();
  const category = document.getElementById("post-category").value.trim();
  const tags = document.getElementById("post-tags").value.trim();
  const mainImage = document.getElementById("post-main-image").files[0];
  const extraImages = document.getElementById("post-extra-images").files;

  if (!title || !content) return alert("Title and content required");

  const fd = new FormData();
  fd.append("title", title);
  fd.append("content", content);
  fd.append("category", category);
  fd.append("tags", tags);

  if (mainImage) fd.append("mainImage", mainImage);
  for (let i = 0; i < extraImages.length; i++) fd.append("extraImages", extraImages[i]);

  try {
    const res = await adminFetch("/api/posts", { method: "POST", body: fd });
    if (res.ok) {
      alert("Post created");
      postForm.reset();
      postForm.classList.add("hidden");
      await loadPosts();
    } else {
      const err = await res.json().catch(()=>null);
      alert("Failed to create post: " + (err?.message || res.status));
    }
  } catch (err) {
    console.error(err);
    alert("Error creating post");
  }
});

// Load posts
async function loadPosts() {
  try {
    const res = await fetch("/api/posts");
    const posts = await res.json();
    postsList.innerHTML = "";
    if (!posts.length) { postsList.innerHTML = "<p>No posts yet.</p>"; return; }
    posts.forEach(p => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <strong>${p.title}</strong> <small>(${p.category})</small>
        <div class="meta">Tags: ${p.tags?.join(", ") || ""}</div>
        <div class="actions">
          <button data-id="${p.id}" class="delete-post">Delete</button>
        </div>
      `;
      postsList.appendChild(div);
    });
    document.querySelectorAll(".delete-post").forEach(b => b.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      if (!confirm("Delete post?")) return;
      const res = await adminFetch(`/api/posts/${id}`, { method: "DELETE" });
      if (res.ok) loadPosts();
      else alert("Delete failed");
    }));
  } catch (err) {
    console.error(err);
  }
}

// About
async function loadAbout() {
  try {
    const res = await fetch("/api/about");
    if (!res.ok) return;
    const about = await res.json();
    aboutTextEl.value = about.text || "";
    aboutEmailEl.value = about.email || "";
    for (const k in socialFields) socialFields[k].value = about.social?.[k] || "";
  } catch (err) {
    console.error(err);
  }
}

saveAboutBtn.addEventListener("click", async () => {
  const aboutData = {
    text: aboutTextEl.value.trim(),
    email: aboutEmailEl.value.trim(),
    social: {}
  };
  for (const k in socialFields) {
    if (socialFields[k].value.trim()) aboutData.social[k] = socialFields[k].value.trim();
  }
  try {
    const res = await adminFetch("/api/about", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aboutData)
    });
    if (res.ok) {
      alert("About updated");
    } else {
      alert("Failed to update about");
    }
  } catch (err) {
    console.error(err);
    alert("Error updating about");
  }
});

// Comments (admin)
async function loadComments() {
  try {
    const res = await fetch("/api/comments"); // server returns all comments in earlier design; if not, you can fetch by post
    const comments = await res.json();
    commentsListAdmin.innerHTML = "";
    if (!comments.length) { commentsListAdmin.innerHTML = "<p>No comments yet.</p>"; return; }
    comments.forEach(c => {
      const div = document.createElement("div");
      div.className = "comment-item";
      div.innerHTML = `
        <strong>${c.name}</strong>
        <p>${c.text}</p>
        <small>${new Date(c.createdAt).toLocaleString()}</small>
        <div><button data-id="${c.id}" class="delete-comment">Delete</button></div>
      `;
      commentsListAdmin.appendChild(div);
    });
    document.querySelectorAll(".delete-comment").forEach(b => b.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      if (!confirm("Delete comment?")) return;
      const res = await adminFetch(`/api/comments/${id}`, { method: "DELETE" });
      if (res.ok) loadComments();
      else alert("Failed to delete comment");
    }));
  } catch (err) {
    console.error(err);
  }
}

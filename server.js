// server.js - file-based blog backend
const express = require("express");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const multer = require("multer");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

// Directories & files
const ROOT = path.resolve();
const DATA_DIR = path.join(ROOT, "data");
const PUBLIC_DIR = path.join(ROOT, "public");
const PRIVATE_DIR = path.join(ROOT, "private");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");

const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const ABOUT_FILE = path.join(DATA_DIR, "about.json");
const COMMENTS_FILE = path.join(DATA_DIR, "comments.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");

// Ensure directories exist
for (const d of [DATA_DIR, PUBLIC_DIR, PRIVATE_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// Helper read/write JSON (synchronous when needed)
async function readJSON(filePath, defaultValue) {
  try {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const exists = fs.existsSync(filePath);
    if (!exists) {
      await writeJSON(filePath, defaultValue);
      return defaultValue;
    }
    const raw = await fsp.readFile(filePath, "utf8");
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (err) {
    console.error("readJSON error", filePath, err);
    return defaultValue;
  }
}

async function writeJSON(filePath, data) {
  try {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("writeJSON error", filePath, err);
    throw err;
  }
}

// Initialize data files if missing
(async () => {
  await readJSON(POSTS_FILE, []);
  await readJSON(COMMENTS_FILE, []);
  await readJSON(ABOUT_FILE, { text: "", email: "", social: {} });
  if (!fs.existsSync(ADMIN_FILE)) {
    await writeJSON(ADMIN_FILE, { password: ADMIN_PASS });
  }
})();

// Middleware
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Serve static public files
app.use(express.static(PUBLIC_DIR));

// Serve private admin files under /secret-admin
app.use("/secret-admin", express.static(PRIVATE_DIR));

// Multer for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

// Admin auth middleware using header x-admin-pass
function adminAuth(req, res, next) {
  const pass = req.headers["x-admin-pass"];
  if (!pass) return res.status(401).json({ ok: false, message: "Missing admin password header" });
  if (pass !== (process.env.ADMIN_PASS || ADMIN_PASS)) {
    return res.status(401).json({ ok: false, message: "Invalid admin password" });
  }
  next();
}

/* ROUTES */

// Health
app.get("/api/ping", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Admin login - simple check
app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ ok: false, message: "Missing password" });
  if (password === (process.env.ADMIN_PASS || ADMIN_PASS)) return res.json({ ok: true });
  return res.status(401).json({ ok: false, message: "Incorrect password" });
});

// -------- POSTS --------
// List posts with optional filters q, category, page, limit
app.get("/api/posts", async (req, res) => {
  try {
    const posts = await readJSON(POSTS_FILE, []);
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Get single post by id
app.get("/api/posts/:id", async (req, res) => {
  try {
    const posts = await readJSON(POSTS_FILE, []);
    const post = posts.find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ ok: false, message: "Post not found" });
    res.json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Create post (admin) - supports mainImage + extraImages
app.post(
  "/api/posts",
  adminAuth,
  upload.fields([{ name: "mainImage", maxCount: 1 }, { name: "extraImages", maxCount: 20 }]),
  async (req, res) => {
    try {
      const posts = await readJSON(POSTS_FILE, []);
      const { title, content, category = "Uncategorized", tags = "" } = req.body;
      if (!title || !content) return res.status(400).json({ ok: false, message: "Missing fields" });

      const mainImageFile = req.files?.mainImage?.[0];
      const extraFiles = req.files?.extraImages || [];
      const newPost = {
        id: uuidv4(),
        title,
        content,
        category,
        tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        mainImage: mainImageFile ? `/uploads/${mainImageFile.filename}` : "",
        extraImages: extraFiles.map((f) => `/uploads/${f.filename}`),
        likes: [], // store IPs
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      posts.unshift(newPost);
      await writeJSON(POSTS_FILE, posts);
      res.json({ ok: true, data: newPost });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false });
    }
  }
);

// Update post (admin)
app.put("/api/posts/:id", adminAuth, upload.single("mainImage"), async (req, res) => {
  try {
    const posts = await readJSON(POSTS_FILE, []);
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, message: "Post not found" });

    const { title, content, category, tags } = req.body;
    if (title) posts[idx].title = title;
    if (content) posts[idx].content = content;
    if (category) posts[idx].category = category;
    if (typeof tags !== "undefined") posts[idx].tags = tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [];
    if (req.file) posts[idx].mainImage = `/uploads/${req.file.filename}`;
    posts[idx].updatedAt = new Date().toISOString();
    await writeJSON(POSTS_FILE, posts);
    res.json({ ok: true, data: posts[idx] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Delete post (admin)
app.delete("/api/posts/:id", adminAuth, async (req, res) => {
  try {
    let posts = await readJSON(POSTS_FILE, []);
    posts = posts.filter(p => p.id !== req.params.id);
    await writeJSON(POSTS_FILE, posts);

    // also remove comments for that post
    let comments = await readJSON(COMMENTS_FILE, []);
    comments = comments.filter(c => c.postId !== req.params.id);
    await writeJSON(COMMENTS_FILE, comments);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Categories endpoint (derived)
app.get("/api/categories", async (req, res) => {
  const posts = await readJSON(POSTS_FILE, []);
  const cats = Array.from(new Set(posts.map(p => p.category || "Uncategorized")));
  res.json(cats);
});

// -------- LIKES --------
// Toggle like by IP (one like per IP). Returns {likes}
app.post("/api/posts/:id/like", async (req, res) => {
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
    const posts = await readJSON(POSTS_FILE, []);
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, message: "Post not found" });

    const likes = posts[idx].likes || [];
    if (likes.includes(ip)) {
      // unlike
      posts[idx].likes = likes.filter(l => l !== ip);
    } else {
      posts[idx].likes = [...likes, ip];
    }

    await writeJSON(POSTS_FILE, posts);
    res.json({ ok: true, likes: posts[idx].likes.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// -------- COMMENTS --------
// Get comments for postId
app.get("/api/comments/:postId", async (req, res) => {
  try {
    const comments = await readJSON(COMMENTS_FILE, []);
    const filtered = comments.filter(c => c.postId === req.params.postId);
    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Add a comment (visitor) - no admin approval required
app.post("/api/comments/:postId", async (req, res) => {
  try {
    const { name = "Anonymous", text } = req.body || {};
    if (!text) return res.status(400).json({ ok: false, message: "Text required" });

    // ensure post exists
    const posts = await readJSON(POSTS_FILE, []);
    if (!posts.find(p => p.id === req.params.postId)) return res.status(400).json({ ok: false, message: "Invalid postId" });

    const comments = await readJSON(COMMENTS_FILE, []);
    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
    const c = {
      id: uuidv4(),
      postId: req.params.postId,
      name,
      text,
      ip,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    comments.push(c);
    await writeJSON(COMMENTS_FILE, comments);
    res.json({ ok: true, data: c });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Edit comment (author by IP or admin)
app.put("/api/comments/:id", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ ok: false, message: "Text required" });

    const comments = await readJSON(COMMENTS_FILE, []);
    const idx = comments.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, message: "Comment not found" });

    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
    const isAdminHeader = req.headers["x-admin-pass"] === (process.env.ADMIN_PASS || ADMIN_PASS);

    if (comments[idx].ip !== ip && !isAdminHeader) {
      return res.status(401).json({ ok: false, message: "Not allowed to edit" });
    }

    comments[idx].text = text;
    comments[idx].updatedAt = new Date().toISOString();
    await writeJSON(COMMENTS_FILE, comments);
    res.json({ ok: true, data: comments[idx] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Delete comment (admin only)
app.delete("/api/comments/:id", adminAuth, async (req, res) => {
  try {
    let comments = await readJSON(COMMENTS_FILE, []);
    comments = comments.filter(c => c.id !== req.params.id);
    await writeJSON(COMMENTS_FILE, comments);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// -------- ABOUT --------
app.get("/api/about", async (req, res) => {
  try {
    const about = await readJSON(ABOUT_FILE, { text: "", email: "", social: {} });
    res.json(about);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Save about (admin)
app.post("/api/about", adminAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const about = {
      text: payload.text || "",
      email: payload.email || "",
      social: payload.social || {}
    };
    await writeJSON(ABOUT_FILE, about);
    res.json({ ok: true, data: about });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Upload helper for admin (single file)
app.post("/api/upload", adminAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, message: "No file uploaded" });
  res.json({ ok: true, url: `/uploads/${req.file.filename}` });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Public: http://localhost:${PORT}/index.html`);
  console.log(`Admin panel: http://localhost:${PORT}/secret-admin/admin-8721.html`);
});

// private/comments.js - simple admin comments listing (optional)
(async () => {
  async function load() {
    const res = await fetch("/api/comments");
    const data = await res.json();
    const container = document.getElementById("comments-list-admin");
    container.innerHTML = "";
    data.forEach(c => {
      const div = document.createElement("div");
      div.innerHTML = `<strong>${c.name}</strong> <p>${c.text}</p> <small>${c.createdAt}</small>`;
      container.appendChild(div);
    });
  }
  load();
})();

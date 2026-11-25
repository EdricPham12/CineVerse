const $ = (s) => document.querySelector(s);
let movies = [],
  showtimes = [],
  seatData = null,
  selected = new Set(),
  activeMovie = null,
  activeShow = null,
  // Phiên đăng nhập chỉ tồn tại trong phiên trình duyệt hiện tại.
  session = JSON.parse(sessionStorage.getItem("cinema-session") || "null"),
  page = "home",
  booking = null,
  timer = null;
const money = (n) => new Intl.NumberFormat("vi-VN").format(n) + " ₫";
const date = (s) =>
  new Date(s).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function api(path, options = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: "Bearer " + session.token } : {}),
      ...(options.headers || {}),
    },
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error || "Có lỗi xảy ra");
  return v;
}
function toast(e) {
  const x = document.createElement("div");
  x.className = "toast";
  x.textContent = e.message || e;
  document.body.append(x);
  setTimeout(() => x.remove(), 4000);
}
function layout(content) {
  $("#app").innerHTML =
    `<header class="top"><nav class="nav shell"><a class="brand" href="#" data-page="home">Cine<span>Verse</span></a><div class="links"><button data-page="home">Phim đang chiếu</button>${session ? `<button data-page="bookings">Vé của tôi</button><button data-page="settings">Cài đặt</button>${session.user.role === "ADMIN" ? '<button data-page="admin">Quản trị</button>' : ""}<button id="logout">Đăng xuất</button>` : '<button data-page="login">Đăng nhập</button>'}</div></nav></header><main class="shell">${content}</main><footer class="footer">CineVerse · Phim và lịch chiếu minh họa, không phải suất chiếu thực tế</footer>`;
  document.querySelectorAll("[data-page]").forEach(
    (x) =>
      (x.onclick = (e) => {
        e.preventDefault();
        navigate(x.dataset.page);
      }),
  );
  $("#logout")?.addEventListener("click", () => {
    session = null;
    sessionStorage.removeItem("cinema-session");
    navigate("home");
  });
}

// Đăng ký bằng email: nhận mã OTP Gmail sau khi tạo tài khoản.
function authPage(kind) {
  layout(
    `<section class="panel form"><div class="eyebrow">Tài khoản CineVerse</div><h1>${kind === "login" ? "Chào mừng trở lại" : "Tạo tài khoản"}</h1><form id="authform">${kind === "register" ? '<label class="field">Họ tên<input name="name" autocomplete="name" required></label><label class="field">Số điện thoại<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0901234567" required></label>' : ""}<label class="field">Email<input name="email" type="email" autocomplete="email" required></label><label class="field">Mật khẩu<input name="password" type="password" autocomplete="${kind === "login" ? "current-password" : "new-password"}" minlength="8" required></label>${kind === "register" ? '<label class="field">Nhập lại mật khẩu<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label>' : ""}<button class="primary full">${kind === "login" ? "Đăng nhập" : "Đăng ký"}</button></form><p class="muted">${kind === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"} <a href="#" id="switch" style="color:#f2b84f">${kind === "login" ? "Đăng ký" : "Đăng nhập"}</a></p></section>`,
  );
  $("#switch").onclick = (e) => {
    e.preventDefault();
    navigate(kind === "login" ? "register" : "login");
  };
  $("#authform").onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    if (kind === "register" && v.password !== v.confirmPassword)
      return toast("Hai lần nhập mật khẩu không khớp");
    try {
      session = await api("/auth/" + kind, {
        method: "POST",
        body: JSON.stringify(v),
      });
      sessionStorage.setItem("cinema-session", JSON.stringify(session));
      navigate(session.user.verified ? "home" : "verify");
    } catch (err) {
      toast(err);
    }
  };
}
function verifyPage() {
  if (!session) return navigate("login");
  layout(
    `<section class="panel form"><div class="eyebrow">Bảo vệ tài khoản</div><h1>Xác minh email</h1><p class="muted">Nhập mã 6 số gửi đến <strong>${esc(session.user.email)}</strong>. Mã có hiệu lực 5 phút. Nếu chưa nhận được mã, hãy chọn Gửi lại mã.</p><form id="verifyform"><label class="field">Mã xác minh<input name="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required></label><button class="primary full">Xác minh</button></form><button class="ghost" id="resend">Gửi lại mã</button></section>`,
  );
  $("#verifyform").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
      });
      session.user = r.user;
      sessionStorage.setItem("cinema-session", JSON.stringify(session));
      toast("Email đã xác minh");
      navigate("home");
    } catch (err) {
      toast(err);
    }
  };
  $("#resend").onclick = async () => {
    try {
      await api("/auth/send-otp", { method: "POST", body: "{}" });
      toast("Đã gửi mã mới");
    } catch (err) {
      toast(err);
    }
  };
}

// Cài đặt tài khoản: cập nhật tên, mật khẩu và trạng thái xác minh.
async function settingsPage() {
  if (!session) return navigate("login");
  const user = await api("/me");
  session.user = user;
  sessionStorage.setItem("cinema-session", JSON.stringify(session));
  layout(
    `<h1 class="page-title">Cài đặt tài khoản</h1><div class="admin-grid"><section class="panel"><h2>Thông tin cá nhân</h2><p class="muted">Email: ${esc(user.email)}<br>Trạng thái: ${user.verified ? "Đã xác minh" : "Chưa xác minh"}</p><form id="profile"><label class="field">Họ tên<input name="name" value="${esc(user.name)}" required></label><label class="field">Số điện thoại<input name="phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(user.phone)}" placeholder="0901234567" required></label><button class="primary">Lưu thông tin</button></form>${user.verified ? "" : '<button class="outline" id="verify-link">Xác minh email</button>'}</section><section class="panel"><h2>Đổi mật khẩu</h2><form id="password"><label class="field">Mật khẩu mới<input name="password" type="password" minlength="8" required></label><button class="primary">Đổi mật khẩu</button></form></section></div>`,
  );
  $("#verify-link")?.addEventListener("click", () => navigate("verify"));
  for (const id of ["profile", "password"])
    $("#" + id).onsubmit = async (e) => {
      e.preventDefault();
      try {
        const u = await api("/me", {
          method: "PATCH",
          body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
        });
        session.user = u;
        sessionStorage.setItem("cinema-session", JSON.stringify(session));
        toast("Đã cập nhật");
        navigate("settings");
      } catch (err) {
        toast(err);
      }
    };
}

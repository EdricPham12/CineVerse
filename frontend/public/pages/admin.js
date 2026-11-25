async function adminPage() {
  if (session?.user.role !== "ADMIN") return navigate("home");
  const data = await api("/admin/overview");
  layout(
    `<h1 class="page-title">Quản trị rạp chiếu</h1><div class="admin-grid"><section class="panel"><h2>Thêm phim</h2><form id="movieform"><label class="field">Tên phim<input name="title" required></label><label class="field">Thể loại<input name="genre" required></label><label class="field">Thời lượng (phút)<input name="duration" type="number" min="30" required></label><label class="field">Phân loại<input name="rating" value="P"></label><label class="field">Mô tả<input name="description"></label><button class="primary">Lưu phim</button></form></section><section class="panel"><h2>Thêm suất chiếu</h2><form id="showform"><label class="field">Phim<select name="movieId">${data.movies.map((m) => `<option value="${m.id}">${esc(m.title)}</option>`).join("")}</select></label><label class="field">Phòng<input name="room" value="Phòng 1" required></label><label class="field">Bắt đầu<input name="startAt" type="datetime-local" required></label><label class="field">Giá ghế thường<input name="basePrice" type="number" min="1" value="85000" required></label><button class="primary">Tạo suất chiếu</button></form><p class="muted">Hệ thống từ chối lịch trùng phòng, kể cả khoảng nghỉ 15 phút.</p></section></div>`,
  );
  for (const [id, path] of [
    ["movieform", "/admin/movies"],
    ["showform", "/admin/showtimes"],
  ])
    $("#" + id).onsubmit = async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target));
      try {
        await api(path, { method: "POST", body: JSON.stringify(v) });
        toast("Đã lưu thành công");
        navigate("admin");
      } catch (err) {
        toast(err);
      }
    };
}
function adminCheckin() {
  const main = document.querySelector("main");
  main.insertAdjacentHTML(
    "beforeend",
    `<section class="panel" style="margin-top:22px"><h2>Kiểm vé tại quầy</h2><p class="muted">Quét mã vạch vào ô bên dưới hoặc nhập dãy ký tự trên vé.</p><form id="checkin-form" style="display:flex;gap:12px;flex-wrap:wrap"><input name="code" placeholder="TK-XXXXXXXX-A1" required style="flex:1;min-width:220px;background:#101520;border:1px solid #3c4558;border-radius:9px;color:white;padding:13px"><button class="primary">Xác nhận vé</button></form><div id="checkin-result"></div></section>`,
  );
  $("#checkin-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await api("/admin/check-in", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
      });
      $("#checkin-result").innerHTML =
        `<p class="notice">Vé hợp lệ: ${esc(result.movie)} · ghế ${esc(result.seat)} · ${date(result.showtime)}. Đã đánh dấu sử dụng.</p>`;
      e.target.reset();
    } catch (err) {
      $("#checkin-result").innerHTML =
        `<p class="notice error">${esc(err.message)}</p>`;
    }
  };
}

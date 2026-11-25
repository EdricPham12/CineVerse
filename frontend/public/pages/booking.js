async function seatPage(preserveSelection = false) {
  const previous = preserveSelection ? [...selected] : [];
  seatData = await api(`/showtimes/${activeShow}/seats`);
  selected.clear();
  for (const id of previous)
    if (seatData.seats.some((seat) => seat.id === id && seat.status === "AVAILABLE"))
      selected.add(id);
  const s = seatData.showtime,
    m = movies.find((x) => x.id === s.movieId);
  layout(
    `<a class="back" href="#" id="back">← Suất chiếu</a><h1 class="page-title">Chọn ghế</h1><div class="two"><section class="panel"><h2>${esc(m.title)}</h2><p class="muted">${date(s.startAt)} · ${esc(s.room)}</p><div class="screen"></div><div class="seats">${seatData.seats.map((x) => `<button class="seat ${x.type === "VIP" ? "vip" : ""} ${x.status !== "AVAILABLE" ? "unavailable" : ""} ${selected.has(x.id) ? "selected" : ""}" data-seat="${x.id}" ${x.status !== "AVAILABLE" ? "disabled" : ""} aria-label="Ghế ${x.id}, ${x.status}">${x.id}</button>`).join("")}</div><div class="legend"><span>■ Còn trống</span><span>■ Đang chọn</span><span>■ VIP (hàng E)</span><span>■ Đã bán / đang thanh toán</span></div></section><aside class="panel"><h3>Thông tin đặt vé</h3><div class="summary-row"><span>Ghế</span><b id="chosen">${[...selected].sort().join(", ") || "Chưa chọn"}</b></div><div class="summary-row"><span>Tổng cộng</span><b class="total" id="total">${money(seatData.seats.filter((seat) => selected.has(seat.id)).reduce((sum, seat) => sum + seat.price, 0))}</b></div><p class="muted">Giá ghế VIP cao hơn 40%. Bạn sẽ được kiểm tra thông tin trước khi thanh toán.</p><button class="primary full" id="checkout">Xem lại đơn đặt</button></aside></div>`,
  );
  $("#back").onclick = (e) => {
    e.preventDefault();
    navigate("movie");
  };
  document.querySelectorAll("[data-seat]").forEach(
    (x) =>
      (x.onclick = () => {
        selected.has(x.dataset.seat)
          ? selected.delete(x.dataset.seat)
          : selected.size < 6
            ? selected.add(x.dataset.seat)
            : toast("Tối đa 6 ghế mỗi đơn");
        x.classList.toggle("selected", selected.has(x.dataset.seat));
        $("#chosen").textContent =
          [...selected].sort().join(", ") || "Chưa chọn";
        $("#total").textContent = money(
          seatData.seats
            .filter((y) => selected.has(y.id))
            .reduce((n, y) => n + y.price, 0),
        );
      }),
  );
  $("#checkout").onclick = async () => {
    if (!selected.size) return toast("Vui lòng chọn ghế");
    if (!session) {
      toast("Đăng nhập để đặt vé");
      return navigate("login");
    }
    if (!session.user.verified) {
      toast("Xác minh email trước khi đặt vé");
      return navigate("verify");
    }
    navigate("review");
  };
}

// Xem lại đơn: chỉ tạo yêu cầu VNPay sau khi khách xác nhận thông tin.
async function reviewPage() {
  if (!seatData || !selected.size) return navigate("seats");
  if (!session) return navigate("login");
  const s = seatData.showtime;
  const m = movies.find((movie) => movie.id === s.movieId);
  const items = seatData.seats.filter((seat) => selected.has(seat.id));
  const total = items.reduce((sum, item) => sum + item.price, 0);
  layout(
    `<a class="back" href="#" id="back">← Đổi ghế</a><div class="review-heading"><div class="eyebrow">Bước cuối trước thanh toán</div><h1>Kiểm tra đơn đặt vé</h1><p>Kiểm tra thông tin bên dưới trước khi chuyển sang VNPay.</p></div><div class="two"><section class="panel review-panel"><h2>${esc(m?.title || "Phim")}</h2><div class="review-row"><span>Suất chiếu</span><strong>${date(s.startAt)}</strong></div><div class="review-row"><span>Phòng chiếu</span><strong>${esc(s.room)}</strong></div><div class="review-row"><span>Ghế</span><strong>${items.map((item) => esc(item.id)).join(", ")}</strong></div><div class="review-row"><span>Người đặt</span><strong>${esc(session.user.name)}</strong></div><div class="review-row"><span>Email nhận mã xác minh</span><strong>${esc(session.user.email)}</strong></div><div class="review-row"><span>Số điện thoại</span><strong>${esc(session.user.phone || "Chưa cập nhật")}</strong></div></section><aside class="panel review-panel"><h2>Chi tiết thanh toán</h2>${items.map((item) => `<div class="review-row"><span>Ghế ${esc(item.id)} · ${item.type === "VIP" ? "VIP" : "Thường"}</span><strong>${money(item.price)}</strong></div>`).join("")}<div class="review-total"><span>Tổng cộng</span><strong>${money(total)}</strong></div><p class="muted">Chỉ phát hành vé khi VNPay xác nhận thanh toán thành công. Ghế sẽ được kiểm tra lại khi bạn bấm thanh toán.</p><button class="primary full" id="pay">Thanh toán qua VNPay</button></aside></div>`,
  );
  $("#back").onclick = (e) => {
    e.preventDefault();
    navigate("seats", { preserveSelection: true });
  };
  $("#pay").onclick = async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    button.textContent = "Đang chuyển đến VNPay...";
    try {
      const result = await api("/bookings/checkout", {
        method: "POST",
        body: JSON.stringify({ showtimeId: s.id, seatIds: items.map((item) => item.id) }),
      });
      location.href = result.paymentUrl;
    } catch (err) {
      toast(err);
      button.disabled = false;
      button.textContent = "Thanh toán qua VNPay";
    }
  };
}

// Vé của tôi: liệt kê đơn, xem trạng thái và mở vé điện tử.
const bookingStatus = (status) =>
  ({
    CONFIRMED: "Đã thanh toán",
    AWAITING_PAYMENT: "Chờ thanh toán",
    PAYMENT_REVIEW: "Cần đối soát",
    CANCELLED: "Đã hủy",
    EXPIRED: "Hết hạn",
  })[status] || status;

async function bookingsPage() {
  if (!session) return navigate("login");
  const list = await api("/bookings");
  layout(
    `<div class="orders-page"><a class="back" href="#" id="back-home">← Về trang phim</a><div class="orders-heading"><div class="eyebrow">Tài khoản / Vé đã đặt</div><h1>Vé và đơn đặt của tôi</h1><p>Chọn một đơn để xem chi tiết và mã vé tại quầy.</p></div>${list.length ? `<div class="orders-list">${list.map((b) => `<article class="order-card"><div class="order-main"><div class="order-title">${esc(b.movie.title)}</div><div class="order-sub">${date(b.startAt)} <span>·</span> ${esc(b.room)} <span>·</span> Ghế ${b.seatIds.map(esc).join(", ")}</div><div class="order-bottom"><span class="badge ${esc(b.status)}">${esc(bookingStatus(b.status))}</span><strong>${money(b.total)}</strong></div></div><button class="outline" data-booking="${esc(b.id)}">Xem chi tiết <span aria-hidden="true">↗</span></button></article>`).join("")}</div>` : '<div class="panel orders-empty">Bạn chưa có đơn đặt vé nào. <button class="outline" id="browse">Xem phim đang chiếu</button></div>'}</div>`,
  );
  $("#back-home").onclick = (e) => {
    e.preventDefault();
    navigate("home");
  };
  $("#browse")?.addEventListener("click", () => navigate("home"));
  document.querySelectorAll("[data-booking]").forEach(
    (button) =>
      (button.onclick = () => {
        booking = list.find((item) => item.id === button.dataset.booking);
        navigate("ticket");
      }),
  );
}

// Vé điện tử: toàn bộ thông tin và mã vạch nằm trên một tờ vé nền trắng.
async function ticketPage() {
  if (!session) return navigate("login");
  if (!booking) return navigate("bookings");
  booking = await api("/bookings/" + booking.id);
  const b = booking;
  const customer = b.customer || session.user;
  const endAt = new Date(
    new Date(b.startAt).getTime() + (b.movie.duration || 0) * 60000,
  );
  const endTime = endAt.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  layout(
    `<div class="ticket-page"><a class="back" href="#" id="back">← Vé và đơn của tôi</a><div class="ticket-page-heading"><div class="eyebrow">CineVerse / Chi tiết đơn</div><h1>${b.status === "CONFIRMED" ? "Vé điện tử" : "Chi tiết đơn đặt"}</h1></div><article class="ticket-sheet"><div class="ticket-sheet-top"><div><span class="ticket-overline">CINEVERSE · VÉ XEM PHIM</span><h2>${esc(b.movie.title)}</h2><p>${esc(b.movie.genre)} · ${b.movie.duration} phút · ${esc(b.movie.rating)}</p></div><span class="ticket-status ${esc(b.status)}">${esc(bookingStatus(b.status))}</span></div><div class="ticket-facts"><div><span>Ngày & giờ chiếu</span><strong>${date(b.startAt)} – ${endTime}</strong></div><div><span>Phòng chiếu</span><strong>${esc(b.room)}</strong></div><div><span>Ghế</span><strong>${b.seatIds.map(esc).join(", ")}</strong></div><div><span>Người đặt</span><strong>${esc(customer.name || "—")}</strong></div><div><span>Số điện thoại</span><strong>${esc(customer.phone || "—")}</strong></div><div><span>Email</span><strong>${esc(customer.email || "—")}</strong></div></div><div class="ticket-order"><div><span>Mã đơn</span><strong>${esc(b.id)}</strong></div><div><span>Đặt lúc</span><strong>${date(b.createdAt)}</strong></div><div><span>Thanh toán</span><strong>VNPay${b.confirmedAt ? ` · ${date(b.confirmedAt)}` : ""}</strong></div></div>${b.status === "AWAITING_PAYMENT" ? '<p class="ticket-note">Đang chờ VNPay xác nhận. Vé sẽ xuất hiện sau khi thanh toán thành công.</p>' : ""}${b.tickets.length ? `<div class="ticket-codes"><h3>Mã nhận vé tại quầy</h3><p>Đưa mã vạch hoặc mã số cho nhân viên để nhận vé. Mỗi ghế có một mã riêng.</p>${b.tickets.map((t) => `<section class="ticket-code"><div class="ticket-code-head"><span>GHẾ ${esc(t.seat)}</span><strong>${esc(t.code)}</strong></div><img data-barcode="${esc(t.code)}" alt="Mã vạch vé ${esc(t.code)}"><div class="ticket-code-state">${t.usedAt ? `Đã sử dụng · ${date(t.usedAt)}` : "Chưa sử dụng · Xuất trình tại quầy"}</div></section>`).join("")}</div>` : ""}<div class="ticket-total"><div><span>Chi tiết</span>${b.items.map((item) => `<div class="ticket-price"><span>Ghế ${esc(item.seat)}</span><strong>${money(item.unitPrice)}</strong></div>`).join("")}</div><div class="ticket-grand"><span>Tổng cộng</span><strong>${money(b.total)}</strong></div></div></article></div>`,
  );
  $("#back").onclick = (e) => {
    e.preventDefault();
    navigate("bookings");
  };
  for (const img of document.querySelectorAll("[data-barcode]")) {
    try {
      const response = await fetch(
        "/api/tickets/" + encodeURIComponent(img.dataset.barcode) + "/barcode",
        { headers: { Authorization: "Bearer " + session.token } },
      );
      if (response.ok) img.src = URL.createObjectURL(await response.blob());
    } catch {}
  }
}

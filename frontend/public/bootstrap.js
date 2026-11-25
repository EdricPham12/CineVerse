const callback = new URLSearchParams(location.search);
if (callback.has("payment")) {
  history.replaceState(null, "", "/");
  if (callback.get("booking")) {
    booking = { id: callback.get("booking") };
    navigate("ticket");
  } else {
    navigate("bookings");
    toast("Không xác minh được kết quả thanh toán");
  }
} else navigate("home");

// Kiểm vé tại quầy: nhân viên quét mã vạch hoặc nhập mã rồi xác nhận một lần.

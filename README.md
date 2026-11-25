# CineVerse

Website đặt vé xem phim mẫu. Frontend và backend tách riêng; mã chia theo chức năng và có ghi chú ngắn.

## Cấu trúc

- `frontend/public/pages/catalog.js`: danh sách phim, chi tiết phim và suất chiếu.
- `frontend/public/pages/booking.js`: chọn ghế, xem lại đơn và chuyển đến VNPay.
- `frontend/public/pages/auth.js`: đăng ký, đăng nhập, xác minh email và cài đặt.
- `frontend/public/pages/tickets.js`: lịch sử, vé điện tử nền trắng, mã vạch.
- `frontend/public/pages/*.css`: kiểu giao diện riêng cho phim, đặt vé và vé điện tử.
- `frontend/public/pages/admin.js`: phim, suất chiếu, kiểm vé tại quầy.
- `backend/src/features/auth/otp.js`: mã OTP qua Gmail.
- `backend/src/features/payment/vnpay.js`: ký và xác minh VNPay.
- `backend/src/catalog.js`: dữ liệu phim mẫu.
- `backend/src/server.js`: API và các quy tắc nghiệp vụ.
- `backend/src/server.test.js`: kiểm thử luồng đặt vé chính.

## Cài đặt và chạy

Cần Node.js 20+. Mở terminal tại thư mục dự án:

```powershell
npm install
Copy-Item backend/.env.example backend/.env
npm start
```

Điền các giá trị thật vào `backend/.env` trước khi đăng ký và thanh toán. Mở `http://localhost:3000`. Không dùng **Go Live** của VS Code vì frontend cần API từ `npm start`.

## Xác minh email bằng mã Gmail

CineVerse xác minh đăng ký bằng mã OTP 6 số gửi qua Gmail, giống luồng trong EZ-Parking. Không dùng Google Sign-In nên không cần Google Client ID.

1. Bật xác minh 2 bước cho tài khoản Google gửi thư.
2. Tạo **App Password** cho ứng dụng gửi thư.
3. Điền `GMAIL_USER` và `GMAIL_APP_PASSWORD` vào `backend/.env`, khởi động lại server.
4. Khách nhập tên, số điện thoại, email và mật khẩu hai lần khi đăng ký. Hai mật khẩu phải khớp. Chỉ email được xác minh bằng mã 6 số; số điện thoại là thông tin liên hệ, không gửi SMS. Mã có hiệu lực 5 phút, được lưu dạng băm, tối đa 5 lần thử, gửi lại sau 60 giây. Chưa xác minh email thì không được đặt vé.

Phiên đăng nhập được giữ trong phiên trình duyệt hiện tại; mở phiên trình duyệt mới sẽ bắt đầu ở trạng thái chưa đăng nhập.

## VNPay

1. Đăng ký merchant/sandbox VNPay để nhận `VNP_TMN_CODE` và `VNP_HASH_SECRET`.
2. Điền chúng cùng `VNP_PAYMENT_URL` và `PUBLIC_BASE_URL` vào `backend/.env`.
3. Cấu hình IPN URL tại VNPay là `https://YOUR-DOMAIN/api/payment/vnpay-ipn`. Return URL được tạo từ `PUBLIC_BASE_URL` thành `/api/payment/vnpay-return`.
4. Server tính tiền, tạo URL có chữ ký. Vé chỉ phát hành sau callback VNPay hợp lệ, đúng số tiền, mã giao dịch và trạng thái thành công. Callback lặp không phát hành thêm vé.

Khách chọn ghế rồi xem lại phim, suất chiếu, thông tin người đặt và tổng tiền. Chỉ khi bấm **Thanh toán qua VNPay** ở màn hình xem lại, server mới tạo đơn chờ thanh toán.

`localhost` không nhận IPN qua Internet. Để thử sandbox cần URL HTTPS công khai hoặc đường hầm phát triển. Nếu tiền đã thu nhưng callback đến sau khi suất/ghế hết hiệu lực, đơn chuyển `PAYMENT_REVIEW`; nhân viên phải hỗ trợ hoặc hoàn tiền thủ công.

## Quản trị viên và kiểm vé

Chạy server một lần để tạo `data.json`, dừng server, sau đó:

```powershell
$env:ADMIN_PASSWORD = 'a-strong-password-at-least-12-chars'
node backend/scripts/create-admin.js admin@example.com
npm start
```

Trang **Quản trị → Kiểm vé tại quầy** nhận mã từ máy quét Code 128 hoặc nhập tay. Mỗi vé chỉ đánh dấu sử dụng một lần. Mã vạch này dùng cho CineVerse; chưa liên thông với hệ thống của rạp khác.

## Luồng nghiệp vụ

Chọn phim → suất chiếu → 1–6 ghế → VNPay → thanh toán thành công → vé điện tử trong **Vé của tôi**. Không có nút giữ chỗ riêng. Backend khóa ghế tối đa 10 phút lúc chờ VNPay để tránh hai người trả tiền cho cùng ghế. Nếu thanh toán thất bại hoặc quá hạn, ghế được trả lại.

Suất chiếu và giá là dữ liệu minh họa của CineVerse, không phải lịch hay vé bán bởi CGV/Lotte.

## Kiểm tra

```powershell
npm test
```

Bài kiểm thử xác nhận OTP, 20 yêu cầu tranh một ghế, callback VNPay, callback lặp, vé và mã vạch.

## Giới hạn trước khi dùng tiền thật

Bản này lưu trong `data.json` và chỉ khóa đồng thời trong một tiến trình Node.js. Trước khi mở thanh toán thật cho khách, cần chuyển sang PostgreSQL với giao dịch và ràng buộc ghế, dùng HTTPS, quản lý secret và xử lý đối soát/hoàn tiền. Poster hiện tham chiếu URL từ các trang rạp; cần xin quyền hoặc thay bằng ảnh được cấp phép trước khi dùng thương mại. Danh sách phim dựa trên thông tin tháng 11/2026 và cần cập nhật định kỳ.


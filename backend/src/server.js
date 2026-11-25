import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import bwipjs from "bwip-js";
import { featuredMovies } from "./catalog.js";
import { sendOtp } from "./features/auth/otp.js";
import {
  vnpDate,
  vnpQuery,
  vnpHash,
  vnpConfigured,
  verifyVnpReply,
} from "./features/payment/vnpay.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
// Cấu hình riêng của backend; không đặt khóa thanh toán trong frontend.
if (fs.existsSync(path.join(root, "backend", ".env")))
  process.loadEnvFile(path.join(root, "backend", ".env"));
const file = process.env.DATA_FILE || path.join(root, "data.json");
const secret =
  process.env.APP_SECRET || "local-demo-change-this-secret-before-deploy";
const port = Number(process.env.PORT || 3000);
const gapMinutes = 15;
const seats = Array.from(
  { length: 40 },
  (_, i) => `${"ABCDE"[Math.floor(i / 8)]}${(i % 8) + 1}`,
);
const seed = () => ({
  users: [],
  movies: [
    {
      id: "m1",
      title: "Thành Phố Sau Cơn Mưa",
      genre: "Tâm lý · Lãng mạn",
      duration: 118,
      rating: "T13",
      description:
        "Một cuộc gặp tình cờ đưa hai người trẻ trở lại những điều họ từng bỏ lỡ.",
      color: "#9f4662",
      published: true,
    },
    {
      id: "m2",
      title: "Dấu Vết Trong Đêm",
      genre: "Bí ẩn · Giật gân",
      duration: 105,
      rating: "T16",
      description: "Một vụ mất tích kéo theo những bí mật của cả thành phố.",
      color: "#3c596b",
      published: true,
    },
    {
      id: "m3",
      title: "Hành Trình Ánh Sao",
      genre: "Phiêu lưu · Khoa học viễn tưởng",
      duration: 132,
      rating: "P",
      description: "Chuyến đi vượt ngoài dải ngân hà để tìm một ngôi nhà mới.",
      color: "#b27a42",
      published: true,
    },
  ],
  showtimes: [],
  bookings: [],
  idempotency: [],
});
let db = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : seed();
db.otps ||= [];
db.paymentAttempts ||= [];
db.ticketChecks ||= [];
for (const movie of featuredMovies)
  if (!db.movies.some((m) => m.id === movie.id)) db.movies.push(movie);
for (const movie of db.movies)
  if (
    ["m1", "m2", "m3"].includes(movie.id) &&
    !db.bookings.some((b) => b.movieId === movie.id)
  )
    movie.published = false;
if (!db.showtimes.length && process.env.NO_SEED_SHOWTIMES !== "1") {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let d = 0; d < 5; d++)
    for (let j = 0; j < 3; j++) {
      const movie = db.movies[j];
      const start = new Date(today);
      start.setDate(start.getDate() + d);
      start.setHours(13 + j * 3, 30, 0, 0);
      if (start.getTime() > Date.now())
        db.showtimes.push({
          id: crypto.randomUUID(),
          movieId: movie.id,
          room: `Phòng ${j + 1}`,
          startAt: start.toISOString(),
          basePrice: 85000,
        });
    }
}
if (process.env.NO_SEED_SHOWTIMES !== "1")
  for (const movie of featuredMovies) {
    if (
      db.showtimes.some(
        (s) => s.movieId === movie.id && new Date(s.startAt) > new Date(),
      )
    )
      continue;
    for (let d = 0; d < 5; d++) {
      const start = new Date();
      start.setDate(start.getDate() + d);
      start.setHours(11 + (featuredMovies.indexOf(movie) % 3) * 4, 30, 0, 0);
      if (start > Date.now())
        db.showtimes.push({
          id: crypto.randomUUID(),
          movieId: movie.id,
          room: `Phòng ${4 + featuredMovies.indexOf(movie)}`,
          startAt: start.toISOString(),
          basePrice: 85000,
        });
    }
  }
const persist = () => fs.writeFileSync(file, JSON.stringify(db, null, 2));
persist();
let lock = Promise.resolve();
const serial = (fn) => {
  const next = lock.then(fn, fn);
  lock = next.catch(() => {});
  return next;
};
const error = (status, message) =>
  Object.assign(new Error(message), { status });
// Số điện thoại: chỉ lưu thông tin liên hệ, không xác minh bằng SMS.
const phoneNumber = (value) => {
  const digits = String(value || "").replace(/[\s.-]/g, "");
  const phone = digits.startsWith("+84") ? `0${digits.slice(3)}` : digits;
  if (!/^0[35789]\d{8}$/.test(phone))
    throw error(400, "Số điện thoại Việt Nam phải có 10 chữ số hợp lệ");
  return phone;
};
const token = (user) => {
  const body = Buffer.from(
    JSON.stringify({
      id: user.id,
      role: user.role,
      exp: Date.now() + 86400000,
    }),
  ).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`;
};
const auth = (req) => {
  const value = (req.headers.authorization || "").replace(/^Bearer /, "");
  const [body, sig] = value.split(".");
  if (!body || !sig) throw error(401, "Vui lòng đăng nhập");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    throw error(401, "Phiên đăng nhập không hợp lệ");
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url"));
  } catch {
    throw error(401, "Phiên đăng nhập không hợp lệ");
  }
  if (payload.exp < Date.now()) throw error(401, "Phiên đã hết hạn");
  const user = db.users.find((u) => u.id === payload.id);
  if (!user) throw error(401, "Tài khoản không tồn tại");
  return user;
};
const admin = (req) => {
  const user = auth(req);
  if (user.role !== "ADMIN")
    throw error(403, "Chỉ quản trị viên được thực hiện");
  return user;
};
const cleanUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone || "",
  role: u.role,
  verified: u.verified === true,
});
const publicMovie = (m) => ({
  id: m.id,
  title: m.title,
  genre: m.genre,
  duration: m.duration,
  rating: m.rating,
  description: m.description,
  color: m.color,
  poster: m.poster || "",
});
const bookingView = (b) => ({
  ...b,
  movie: publicMovie(db.movies.find((m) => m.id === b.movieId)),
  tickets:
    b.status === "CONFIRMED"
      ? b.seatIds.map((seat) => {
          const code = `TK-${b.id.slice(0, 8).toUpperCase()}-${seat}`;
          return {
            code,
            seat,
            usedAt:
              db.ticketChecks.find((x) => x.code === code)?.usedAt || null,
          };
        })
      : [],
});
const expired = (b) =>
  ["PENDING", "AWAITING_PAYMENT"].includes(b.status) &&
  new Date(b.expiresAt).getTime() <= Date.now();
const expire = () => {
  let changed = false;
  for (const b of db.bookings)
    if (expired(b)) {
      b.status = "EXPIRED";
      changed = true;
    }
  if (changed) persist();
};
const statusFor = (showtimeId, seat) => {
  const b = db.bookings.find(
    (x) =>
      x.showtimeId === showtimeId &&
      x.seatIds.includes(seat) &&
      (x.status === "CONFIRMED" ||
        (["PENDING", "AWAITING_PAYMENT"].includes(x.status) && !expired(x))),
  );
  return b?.status === "CONFIRMED" ? "SOLD" : b ? "HELD" : "AVAILABLE";
};
const configured = () => vnpConfigured(process.env);
const mailCode = (user) => sendOtp(db, persist, user, process.env);
const paymentResult = async (values) =>
  serial(async () => {
    const hash = values.vnp_SecureHash;
    const fields = {};
    for (const [k, v] of Object.entries(values))
      if (
        k.startsWith("vnp_") &&
        k !== "vnp_SecureHash" &&
        k !== "vnp_SecureHashType"
      )
        fields[k] = v;
    if (!verifyVnpReply(values, process.env))
      return { code: "97", message: "Invalid signature" };
    const attempt = db.paymentAttempts.find((a) => a.ref === values.vnp_TxnRef);
    if (!attempt) return { code: "01", message: "Order not found" };
    if (String(attempt.amount * 100) !== values.vnp_Amount)
      return { code: "04", message: "Invalid amount" };
    if (attempt.status !== "PENDING")
      return {
        code: "02",
        message: "Already processed",
        bookingId: attempt.bookingId,
      };
    const b = db.bookings.find((x) => x.id === attempt.bookingId);
    const paid =
      values.vnp_ResponseCode === "00" && values.vnp_TransactionStatus === "00";
    if (paid && b && b.status === "AWAITING_PAYMENT" && !expired(b)) {
      b.status = "CONFIRMED";
      b.confirmedAt = new Date().toISOString();
      attempt.status = "SUCCESS";
    } else {
      attempt.status = paid ? "REVIEW_REQUIRED" : "FAILED";
      if (b?.status === "AWAITING_PAYMENT")
        b.status = paid ? "PAYMENT_REVIEW" : "CANCELLED";
    }
    persist();
    return { code: "00", message: "Processed", bookingId: attempt.bookingId };
  });
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
const read = async (req) => {
  let raw = "";
  for await (const part of req) {
    raw += part;
    if (raw.length > 50000) throw error(413, "Dữ liệu quá lớn");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw error(400, "JSON không hợp lệ");
  }
};
const route = async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  const method = req.method;
  if (method === "GET" && p === "/api/config")
    return json(res, 200, {
      vnpay: configured(),
      email: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    });
  const qrMatch = p.match(/^\/api\/tickets\/([^/]+)\/qr$/);
  if (method === "GET" && qrMatch) {
    const u = auth(req),
      code = qrMatch[1],
      b = db.bookings.find(
        (x) =>
          x.userId === u.id &&
          bookingView(x).tickets.some((t) => t.code === code),
      );
    if (!b) throw error(404, "Không tìm thấy vé");
    const svg = await QRCode.toString(code, {
      type: "svg",
      margin: 2,
      width: 220,
      color: { dark: "#171c29", light: "#ffffffff" },
    });
    res.writeHead(200, {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
    });
    return res.end(svg);
  }
  const barcodeMatch = p.match(/^\/api\/tickets\/([^/]+)\/barcode$/);
  if (method === "GET" && barcodeMatch) {
    const u = auth(req),
      code = barcodeMatch[1],
      b = db.bookings.find(
        (x) =>
          x.userId === u.id &&
          bookingView(x).tickets.some((t) => t.code === code),
      );
    if (!b) throw error(404, "Không tìm thấy vé");
    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text: code,
      scale: 3,
      height: 14,
      includetext: false,
      paddingwidth: 12,
      paddingheight: 10,
      backgroundcolor: "FFFFFF",
    });
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    });
    return res.end(png);
  }
  if (method === "POST" && p === "/api/admin/check-in")
    return serial(async () => {
      admin(req);
      const v = await read(req),
        code = String(v.code || "")
          .trim()
          .toUpperCase();
      const b = db.bookings.find(
        (x) =>
          x.status === "CONFIRMED" &&
          bookingView(x).tickets.some((t) => t.code === code),
      );
      if (!b) throw error(404, "Mã vé không hợp lệ");
      if (db.ticketChecks.some((x) => x.code === code))
        throw error(409, "Vé này đã được sử dụng");
      const check = { code, usedAt: new Date().toISOString() };
      db.ticketChecks.push(check);
      persist();
      return json(res, 200, {
        ...check,
        movie: db.movies.find((x) => x.id === b.movieId)?.title,
        seat: code.split("-").at(-1),
        showtime: b.startAt,
      });
    });
  if (method === "GET" && p === "/api/payment/vnpay-ipn") {
    const result = await paymentResult(Object.fromEntries(url.searchParams));
    return json(res, 200, { RspCode: result.code, Message: result.message });
  }
  if (method === "GET" && p === "/api/payment/vnpay-return") {
    const result = await paymentResult(Object.fromEntries(url.searchParams));
    res.writeHead(302, {
      Location: `/?payment=${encodeURIComponent(result.code)}&booking=${encodeURIComponent(result.bookingId || "")}`,
    });
    return res.end();
  }
  if (method === "POST" && p === "/api/auth/send-otp") {
    const u = auth(req);
    if (u.verified) return json(res, 200, { message: "Email đã xác minh" });
    const old = db.otps.find((o) => o.userId === u.id);
    if (old && Date.now() - old.lastSentAt < 60000)
      throw error(429, "Vui lòng đợi 60 giây trước khi gửi lại");
    return json(res, 200, await mailCode(u));
  }
  if (method === "POST" && p === "/api/auth/verify-otp") {
    const u = auth(req),
      v = await read(req),
      o = db.otps.find((x) => x.userId === u.id);
    if (!o || o.expiresAt < Date.now() || o.attempts >= 5)
      throw error(400, "Mã đã hết hạn, vui lòng gửi lại");
    o.attempts++;
    const value = String(v.code || "");
    if (
      !/^\d{6}$/.test(value) ||
      crypto
        .createHash("sha256")
        .update(o.salt + value)
        .digest("hex") !== o.hash
    ) {
      persist();
      throw error(400, "Mã xác minh không đúng");
    }
    u.verified = true;
    db.otps = db.otps.filter((x) => x.userId !== u.id);
    persist();
    return json(res, 200, { user: cleanUser(u) });
  }
  if (method === "PATCH" && p === "/api/me") {
    const u = auth(req),
      v = await read(req);
    if (v.name !== undefined) {
      if (typeof v.name !== "string" || v.name.trim().length < 2)
        throw error(400, "Tên ít nhất 2 ký tự");
      u.name = v.name.trim();
    }
    if (v.phone !== undefined) u.phone = phoneNumber(v.phone);
    if (v.password !== undefined) {
      if (String(v.password).length < 8)
        throw error(400, "Mật khẩu ít nhất 8 ký tự");
      u.salt = crypto.randomBytes(16).toString("hex");
      u.hash = crypto.scryptSync(v.password, u.salt, 64).toString("hex");
    }
    persist();
    return json(res, 200, cleanUser(u));
  }
  if (method === "POST" && p === "/api/bookings/checkout")
    return serial(async () => {
      const u = auth(req);
      if (!u.verified)
        throw error(403, "Vui lòng xác minh email trước khi đặt vé");
      if (!configured())
        throw error(503, "VNPay chưa được cấu hình trong .env");
      const v = await read(req);
      expire();
      const s = db.showtimes.find((x) => x.id === v.showtimeId),
        ids = v.seatIds;
      if (!s || new Date(s.startAt) <= new Date())
        throw error(409, "Suất chiếu không còn hiệu lực");
      if (
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 6 ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !seats.includes(id))
      )
        throw error(400, "Chọn từ 1 đến 6 ghế hợp lệ");
      if (ids.some((id) => statusFor(s.id, id) !== "AVAILABLE"))
        throw error(409, "Ghế đã được người khác chọn");
      const now = new Date(),
        expiry = new Date(
          Math.min(now.getTime() + 10 * 60000, new Date(s.startAt).getTime()),
        );
      const ref = crypto.randomBytes(12).toString("hex");
      const b = {
        id: crypto.randomUUID(),
        userId: u.id,
        movieId: s.movieId,
        showtimeId: s.id,
        customer: { name: u.name, email: u.email, phone: u.phone || "" },
        room: s.room,
        startAt: s.startAt,
        seatIds: [...ids].sort(),
        items: ids.map((id) => ({
          seat: id,
          unitPrice: Math.round(s.basePrice * (id[0] === "E" ? 1.4 : 1)),
        })),
        total: ids.reduce(
          (n, id) => n + Math.round(s.basePrice * (id[0] === "E" ? 1.4 : 1)),
          0,
        ),
        status: "AWAITING_PAYMENT",
        createdAt: now.toISOString(),
        expiresAt: expiry.toISOString(),
      };
      const fields = {
        vnp_Version: "2.1.0",
        vnp_Command: "pay",
        vnp_TmnCode: process.env.VNP_TMN_CODE,
        vnp_Amount: String(b.total * 100),
        vnp_CurrCode: "VND",
        vnp_TxnRef: ref,
        vnp_OrderInfo: `CineVerse ${b.id.slice(0, 8)}`,
        vnp_OrderType: "other",
        vnp_Locale: "vn",
        vnp_ReturnUrl: `${process.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/payment/vnpay-return`,
        vnp_IpAddr:
          req.socket.remoteAddress?.replace("::ffff:", "") || "127.0.0.1",
        vnp_CreateDate: vnpDate(now),
        vnp_ExpireDate: vnpDate(expiry),
      };
      const signed = vnpQuery(fields),
        gateway =
          process.env.VNP_PAYMENT_URL ||
          "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
      db.bookings.push(b);
      db.paymentAttempts.push({
        ref,
        bookingId: b.id,
        amount: b.total,
        status: "PENDING",
      });
      persist();
      return json(res, 201, {
        booking: bookingView(b),
        paymentUrl: `${gateway}?${signed}&vnp_SecureHash=${vnpHash(fields, process.env.VNP_HASH_SECRET)}`,
      });
    });
  if (
    p === "/api/bookings/holds" ||
    /^\/api\/bookings\/[^/]+\/confirm$/.test(p)
  )
    throw error(410, "Đã chuyển sang đặt vé và thanh toán VNPay trực tiếp");
  if (method === "GET" && p === "/api/movies")
    return json(
      res,
      200,
      db.movies.filter((m) => m.published).map(publicMovie),
    );
  if (method === "GET" && p === "/api/showtimes")
    return json(
      res,
      200,
      db.showtimes
        .filter(
          (s) =>
            s.movieId === url.searchParams.get("movieId") &&
            new Date(s.startAt) > new Date(),
        )
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    );
  const seatPath = p.match(/^\/api\/showtimes\/([^/]+)\/seats$/);
  if (method === "GET" && seatPath) {
    const show = db.showtimes.find((s) => s.id === seatPath[1]);
    if (!show) throw error(404, "Không tìm thấy suất chiếu");
    expire();
    return json(res, 200, {
      showtime: show,
      seats: seats.map((id) => ({
        id,
        type: id[0] === "E" ? "VIP" : "STANDARD",
        status: statusFor(show.id, id),
        price: Math.round(show.basePrice * (id[0] === "E" ? 1.4 : 1)),
      })),
    });
  }
  if (method === "POST" && p === "/api/auth/register") {
    const v = await read(req);
    const email = String(v.email || "")
      .trim()
      .toLowerCase();
    if (
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
      String(v.password || "").length < 8 ||
      !String(v.name || "").trim()
    )
      throw error(400, "Nhập tên, email hợp lệ và mật khẩu ít nhất 8 ký tự");
    if (v.password !== v.confirmPassword)
      throw error(400, "Hai lần nhập mật khẩu không khớp");
    if (db.users.some((u) => u.email === email))
      throw error(409, "Email đã được sử dụng");
    if (!process.env.GMAIL_USER && !process.env.EMAIL_TEST_MODE)
      throw error(503, "Chưa cấu hình Gmail SMTP");
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(v.password, salt, 64).toString("hex");
    const phone = phoneNumber(v.phone);
    const u = {
      id: crypto.randomUUID(),
      name: v.name.trim(),
      email,
      phone,
      role: "CUSTOMER",
      verified: false,
      salt,
      hash,
    };
    db.users.push(u);
    persist();
    const sent = await mailCode(u);
    return json(res, 201, { user: cleanUser(u), token: token(u), ...sent });
  }
  if (method === "POST" && p === "/api/auth/login") {
    const v = await read(req);
    const u = db.users.find(
      (x) => x.email === String(v.email || "").toLowerCase(),
    );
    if (
      !u ||
      !u.hash ||
      !u.salt ||
      crypto
        .scryptSync(String(v.password || ""), u.salt, 64)
        .toString("hex") !== u.hash
    )
      throw error(401, "Email hoặc mật khẩu không đúng");
    return json(res, 200, { user: cleanUser(u), token: token(u) });
  }
  if (method === "GET" && p === "/api/me")
    return json(res, 200, cleanUser(auth(req)));
  if (method === "POST" && p === "/api/bookings/holds")
    return serial(async () => {
      const u = auth(req),
        v = await read(req);
      expire();
      const s = db.showtimes.find((x) => x.id === v.showtimeId);
      if (!s || new Date(s.startAt) <= new Date())
        throw error(409, "Suất chiếu đã bắt đầu hoặc không tồn tại");
      const ids = v.seatIds;
      if (
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 6 ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !seats.includes(id))
      )
        throw error(400, "Chọn từ 1 đến 6 ghế hợp lệ, không trùng nhau");
      if (ids.some((id) => statusFor(s.id, id) !== "AVAILABLE"))
        throw error(409, "Một hoặc nhiều ghế vừa được người khác chọn");
      const b = {
        id: crypto.randomUUID(),
        userId: u.id,
        movieId: s.movieId,
        showtimeId: s.id,
        room: s.room,
        startAt: s.startAt,
        seatIds: [...ids].sort(),
        items: ids.map((id) => ({
          seat: id,
          unitPrice: Math.round(s.basePrice * (id[0] === "E" ? 1.4 : 1)),
        })),
        total: ids.reduce(
          (n, id) => n + Math.round(s.basePrice * (id[0] === "E" ? 1.4 : 1)),
          0,
        ),
        status: "PENDING",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
          Math.min(Date.now() + 300000, new Date(s.startAt).getTime()),
        ).toISOString(),
      };
      db.bookings.push(b);
      persist();
      return json(res, 201, bookingView(b));
    });
  if (method === "GET" && p === "/api/bookings") {
    const u = auth(req);
    expire();
    return json(
      res,
      200,
      db.bookings
        .filter((b) => b.userId === u.id)
        .reverse()
        .map(bookingView),
    );
  }
  const match = p.match(/^\/api\/bookings\/([^/]+)(?:\/(confirm|cancel))?$/);
  if (match) {
    const u = auth(req),
      b = db.bookings.find((x) => x.id === match[1]);
    if (!b || b.userId !== u.id) throw error(404, "Không tìm thấy đơn đặt vé");
    if (method === "GET" && !match[2]) {
      expire();
      return json(res, 200, bookingView(b));
    }
    if (method === "POST" && match[2])
      return serial(async () => {
        const body = await read(req);
        if (Object.keys(body).length)
          throw error(
            400,
            "Yêu cầu không nhận dữ liệu thanh toán từ trình duyệt",
          );
        expire();
        if (match[2] === "cancel") {
          if (b.status !== "PENDING") throw error(409, "Không thể hủy đơn này");
          b.status = "CANCELLED";
          persist();
          return json(res, 200, bookingView(b));
        }
        const key = String(req.headers["idempotency-key"] || "");
        if (!key || key.length > 100) throw error(400, "Thiếu Idempotency-Key");
        const prior = db.idempotency.find(
          (x) => x.userId === u.id && x.bookingId === b.id && x.key === key,
        );
        if (prior) return json(res, 200, bookingView(b));
        if (b.status !== "PENDING")
          throw error(409, "Đơn đã xác nhận hoặc hết hạn");
        if (process.env.MOCK_PAYMENT_RESULT === "FAILED")
          throw error(409, "Thanh toán mô phỏng thất bại");
        b.status = "CONFIRMED";
        b.confirmedAt = new Date().toISOString();
        db.idempotency.push({ userId: u.id, bookingId: b.id, key });
        persist();
        return json(res, 200, bookingView(b));
      });
  }
  if (method === "GET" && p === "/api/admin/overview") {
    admin(req);
    return json(res, 200, {
      movies: db.movies,
      showtimes: db.showtimes,
      bookings: db.bookings.length,
    });
  }
  if (method === "POST" && p === "/api/admin/movies") {
    admin(req);
    const v = await read(req);
    if (
      !v.title ||
      !Number.isFinite(Number(v.duration)) ||
      Number(v.duration) < 30
    )
      throw error(400, "Tên phim và thời lượng không hợp lệ");
    const m = {
      id: crypto.randomUUID(),
      title: String(v.title).trim(),
      genre: String(v.genre || "Phim"),
      duration: Number(v.duration),
      rating: String(v.rating || "P"),
      description: String(v.description || ""),
      color: String(v.color || "#654b72"),
      published: true,
    };
    db.movies.push(m);
    persist();
    return json(res, 201, m);
  }
  if (method === "POST" && p === "/api/admin/showtimes")
    return serial(async () => {
      admin(req);
      const v = await read(req),
        m = db.movies.find((x) => x.id === v.movieId),
        start = new Date(v.startAt),
        room = String(v.room || "").trim(),
        basePrice = Number(v.basePrice);
      if (
        !m ||
        !room ||
        !Number.isFinite(start.getTime()) ||
        start <= new Date() ||
        !Number.isFinite(basePrice) ||
        basePrice <= 0
      )
        throw error(400, "Thông tin suất chiếu không hợp lệ");
      const end = start.getTime() + (m.duration + gapMinutes) * 60000;
      if (
        db.showtimes.some(
          (x) =>
            x.room === room &&
            start.getTime() <
              new Date(x.startAt).getTime() +
                (db.movies.find((y) => y.id === x.movieId).duration +
                  gapMinutes) *
                  60000 &&
            new Date(x.startAt).getTime() < end,
        )
      )
        throw error(409, "Phòng chiếu đã có suất trùng giờ");
      const s = {
        id: crypto.randomUUID(),
        movieId: m.id,
        room,
        startAt: start.toISOString(),
        basePrice,
      };
      db.showtimes.push(s);
      persist();
      return json(res, 201, s);
    });
  throw error(404, "Không tìm thấy đường dẫn");
};
http
  .createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/")) return await route(req, res);
      let name = new URL(req.url, "http://localhost").pathname;
      if (name === "/") name = "/index.html";
      if (
        !/^(\/index\.html|\/style\.css|\/(core|navigation|bootstrap)\.js|\/pages\/(catalog|booking|tickets)\.css|\/pages\/(catalog|booking|auth|tickets|admin)\.js)$/.test(
          name,
        )
      )
        throw error(404, "Không tìm thấy");
      const type = name.endsWith(".js")
        ? "text/javascript"
        : name.endsWith(".css")
          ? "text/css"
          : "text/html";
      res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
      fs.createReadStream(path.join(root, "frontend/public", name)).pipe(res);
    } catch (e) {
      json(res, e.status || 500, {
        error: e.status ? e.message : "Lỗi máy chủ",
      });
    }
  })
  .listen(port, () => console.log(`Cinema booking: http://localhost:${port}`));

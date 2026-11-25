import crypto from "node:crypto";
import nodemailer from "nodemailer";

// Xác minh email: tạo mã 6 số; chỉ lưu bản băm, hết hạn sau 5 phút.
export async function sendOtp(db, persist, user, env) {
  if (
    (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) &&
    env.EMAIL_TEST_MODE !== "1"
  )
    throw Object.assign(new Error("Chưa cấu hình Gmail SMTP"), { status: 503 });
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const salt = crypto.randomBytes(12).toString("hex");
  db.otps = db.otps.filter((item) => item.userId !== user.id);
  db.otps.push({
    userId: user.id,
    salt,
    hash: crypto
      .createHash("sha256")
      .update(salt + code)
      .digest("hex"),
    expiresAt: Date.now() + 300000,
    attempts: 0,
    lastSentAt: Date.now(),
  });
  persist();
  if (env.EMAIL_TEST_MODE === "1") return { testCode: code };
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
  });
  await transport.sendMail({
    from: `CineVerse <${env.GMAIL_USER}>`,
    to: user.email,
    subject: "Mã xác minh CineVerse",
    text: `Mã xác minh của bạn: ${code}. Mã có hiệu lực trong 5 phút. Không chia sẻ mã này.`,
  });
  return {};
}

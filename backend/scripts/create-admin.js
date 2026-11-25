import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const file =
  process.env.DATA_FILE ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data.json");
const email = process.argv[2]?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12) {
  console.error(
    "Cách dùng: đặt ADMIN_PASSWORD (ít nhất 12 ký tự), rồi chạy node create-admin.js admin@example.com",
  );
  process.exit(1);
}
const db = JSON.parse(fs.readFileSync(file, "utf8"));
if (db.users.some((u) => u.email === email)) {
  console.error("Email đã tồn tại");
  process.exit(1);
}
const salt = crypto.randomBytes(16).toString("hex");
db.users.push({
  id: crypto.randomUUID(),
  name: "Quản trị viên",
  email,
  role: "ADMIN",
  verified: true,
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString("hex"),
});
fs.writeFileSync(file, JSON.stringify(db, null, 2));
console.log("Đã tạo tài khoản quản trị:", email);

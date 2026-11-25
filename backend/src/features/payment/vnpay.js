import crypto from "node:crypto";

// VNPay: định dạng thời gian theo Việt Nam, ký và kiểm tra các tham số giao dịch.
export const vnpDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return ["year", "month", "day", "hour", "minute", "second"].map(get).join("");
};

export const vnpQuery = (fields) =>
  Object.keys(fields)
    .sort()
    .map(
      (key) => `${key}=${encodeURIComponent(fields[key]).replace(/%20/g, "+")}`,
    )
    .join("&");

export const vnpHash = (fields, secret) =>
  crypto.createHmac("sha512", secret).update(vnpQuery(fields)).digest("hex");

export const vnpConfigured = (env) =>
  Boolean(env.VNP_TMN_CODE && env.VNP_HASH_SECRET && env.PUBLIC_BASE_URL);

export function verifyVnpReply(values, env) {
  const hash = values.vnp_SecureHash;
  if (
    !vnpConfigured(env) ||
    typeof hash !== "string" ||
    !/^[a-f0-9]{128}$/i.test(hash) ||
    values.vnp_TmnCode !== env.VNP_TMN_CODE
  )
    return false;
  const fields = {};
  for (const [key, value] of Object.entries(values)) {
    if (
      key.startsWith("vnp_") &&
      key !== "vnp_SecureHash" &&
      key !== "vnp_SecureHashType"
    )
      fields[key] = value;
  }
  return crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(vnpHash(fields, env.VNP_HASH_SECRET), "hex"),
  );
}

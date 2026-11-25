import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Đặt vé: kiểm tra đăng ký/xác minh, tranh chấp ghế, callback VNPay và kiểm vé.
test("checkout issues exactly one ticket after signed payment and check-in is one-time", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cinema-test-"));
  const port = 32000 + Math.floor(Math.random() * 10000),
    base = `http://127.0.0.1:${port}/api`;
  const child = spawn(process.execPath, ["backend/src/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(dir, "data.json"),
      APP_SECRET: "test-secret",
      EMAIL_TEST_MODE: "1",
      VNP_TMN_CODE: "TEST",
      VNP_HASH_SECRET: "test-hash-secret",
      PUBLIC_BASE_URL: `http://localhost:${port}`,
    },
  });
  let startupOutput = "";
  child.stdout.on("data", (chunk) => (startupOutput += chunk.toString()));
  child.stderr.on("data", (chunk) => (startupOutput += chunk.toString()));
  try {
    let ready = false;
    let lastStartupError = "";
    for (let i = 0; i < 100; i++) {
      try {
        const response = await fetch(base + "/movies");
        if (response.ok) {
          ready = true;
          break;
        }
        lastStartupError = `HTTP ${response.status}`;
      } catch (e) {
        lastStartupError = String(e.cause || e);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(ready, `Server did not start: ${startupOutput}; ${lastStartupError}`);
    for (const stylesheet of ["catalog", "booking", "tickets"]) {
      const css = await fetch(
        `http://127.0.0.1:${port}/pages/${stylesheet}.css`,
      );
      assert.equal(css.status, 200);
      assert.match(css.headers.get("content-type"), /text\/css/);
    }
    const req = async (p, method = "GET", body, token) => {
      const r = await fetch(base + p, {
        method,
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: r.status,
        data: r.headers.get("content-type")?.includes("json")
          ? await r.json()
          : null,
        headers: r.headers,
      };
    };
    assert.equal(
      (
        await req("/auth/register", "POST", {
          name: "Customer",
          email: "wrong@example.com",
          phone: "0901234567",
          password: "password123",
          confirmPassword: "different123",
        })
      ).status,
      400,
    );
    const reg = await req("/auth/register", "POST", {
      name: "Customer",
      email: "one@example.com",
      phone: "0901234567",
      password: "password123",
      confirmPassword: "password123",
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.user.verified, false);
    assert.equal(reg.data.user.phone, "0901234567");
    assert.equal(
      (await req("/me", "PATCH", { phone: "+84987654321" }, reg.data.token))
        .data.phone,
      "0987654321",
    );
    const token = reg.data.token;
    assert.equal(
      (
        await req(
          "/auth/verify-otp",
          "POST",
          { code: reg.data.testCode },
          token,
        )
      ).data.user.verified,
      true,
    );
    const movie = (await req("/movies")).data.find((m) => m.id === "now1");
    const show = (await req("/showtimes?movieId=" + movie.id)).data[0];
    assert.ok(show);
    const requests = await Promise.all(
      Array.from({ length: 20 }, () =>
        req(
          "/bookings/checkout",
          "POST",
          { showtimeId: show.id, seatIds: ["A1"] },
          token,
        ),
      ),
    );
    assert.equal(requests.filter((r) => r.status === 201).length, 1);
    assert.equal(requests.filter((r) => r.status === 409).length, 19);
    const winner = requests.find((r) => r.status === 201).data,
      booking = winner.booking;
    assert.equal(booking.customer.phone, "0987654321");
    assert.equal((await req("/bookings/" + booking.id)).status, 401);
    assert.equal(
      (await req("/bookings/" + booking.id, "GET", null, token)).data.tickets
        .length,
      0,
    );
    const params = new URL(winner.paymentUrl).searchParams;
    assert.match(params.get("vnp_CreateDate"), /^20\d{12}$/);
    const fields = Object.fromEntries(params);
    delete fields.vnp_SecureHash;
    fields.vnp_ResponseCode = "00";
    fields.vnp_TransactionStatus = "00";
    const query = Object.keys(fields)
      .sort()
      .map((k) => `${k}=${encodeURIComponent(fields[k]).replace(/%20/g, "+")}`)
      .join("&");
    const hash = crypto
      .createHmac("sha512", "test-hash-secret")
      .update(query)
      .digest("hex");
    const ipn = await req(
      "/payment/vnpay-ipn?" + query + "&vnp_SecureHash=" + hash,
    );
    assert.equal(ipn.data.RspCode, "00");
    const paid = (await req("/bookings/" + booking.id, "GET", null, token))
      .data;
    assert.equal(paid.status, "CONFIRMED");
    assert.equal(paid.tickets.length, 1);
    assert.equal(
      (await req("/payment/vnpay-ipn?" + query + "&vnp_SecureHash=" + hash))
        .data.RspCode,
      "02",
    );
    const barcode = await fetch(
      base + "/tickets/" + paid.tickets[0].code + "/barcode",
      { headers: { Authorization: "Bearer " + token } },
    );
    assert.equal(barcode.status, 200);
    assert.equal(barcode.headers.get("content-type"), "image/png");
    const unpaid = await req(
      "/bookings/checkout",
      "POST",
      { showtimeId: show.id, seatIds: ["A2"] },
      token,
    );
    assert.equal(unpaid.status, 201);
    const unpaidId = unpaid.data.booking.id;
    assert.equal(
      (await req(`/bookings/${unpaidId}/cancel`, "POST", {}, token)).data
        .status,
      "CANCELLED",
    );
    assert.equal(
      (await req(`/showtimes/${show.id}/seats`)).data.seats.find((s) => s.id === "A2").status,
      "AVAILABLE",
    );
    const lateFields = Object.fromEntries(new URL(unpaid.data.paymentUrl).searchParams);
    delete lateFields.vnp_SecureHash;
    lateFields.vnp_ResponseCode = "00";
    lateFields.vnp_TransactionStatus = "00";
    const lateQuery = Object.keys(lateFields)
      .sort()
      .map((k) => `${k}=${encodeURIComponent(lateFields[k]).replace(/%20/g, "+")}`)
      .join("&");
    const lateHash = crypto.createHmac("sha512", "test-hash-secret").update(lateQuery).digest("hex");
    await req(`/payment/vnpay-ipn?${lateQuery}&vnp_SecureHash=${lateHash}`);
    const review = (await req(`/bookings/${unpaidId}`, "GET", null, token)).data;
    assert.equal(review.status, "PAYMENT_REVIEW");
    assert.equal(review.tickets.length, 0);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

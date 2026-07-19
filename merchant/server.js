/**
 * "TicketMaster" — demo storefront (not affiliated). Express + static HTML.
 * Hands off checkout to SunPay via a signed URL and flips the order to
 * Confirmed when SunPay's signed settlement callback arrives.
 */
const express = require("express");
const crypto = require("crypto");
const path = require("path");

const PORT = process.env.PORT || 3001;
const SUNPAY_URL = process.env.SUNPAY_URL || "http://localhost:3000";
const SECRET = process.env.SDK_SHARED_SECRET;
if (!SECRET) {
  console.error("SDK_SHARED_SECRET missing — copy it from app/.env.local");
  process.exit(1);
}

// ~10 lines of HMAC, matching app/src/lib/sign.ts (§7.3): sorted k=v pairs.
function signParams(params) {
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHmac("sha256", SECRET).update(canonical).digest("hex");
}
function verifyParams(params, sig) {
  const expected = signParams(params);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(String(sig || ""), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// In-memory order store, (re)seeded on boot and on demo reset (spec §8).
const orders = new Map();
function seedOrder(id) {
  orders.set(id, {
    id,
    event: "Total Eclipse of the Chart — World Tour",
    venue: "Scotiabank Arena, Toronto",
    date: "Sat, Sep 12 2026 · 8:00 PM",
    qty: 3,
    unit_cents: 23333, // 3 × $233.33 = $699.99 + $0.01 order fee = $700.00
    fee_cents: 1,
    total_cents: 70000,
    status: "pending", // 'pending' | 'confirmed'
    paid_via: null,
  });
}
seedOrder("ORD-8814");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- pages ---------------------------------------------------------------
app.get("/", (_req, res) => res.redirect("/seats"));
app.get("/seats", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "seats.html"))
);
app.get("/event", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "event.html"))
);
app.get("/checkout/:orderId", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "checkout.html"))
);
app.get("/order/:orderId", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "order.html"))
);

// --- API -----------------------------------------------------------------
app.get("/api/order/:id", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "not found" });
  res.json(order);
});

// The signed handoff URL. The secret stays server-side; sdk.js fetches this.
app.get("/api/handoff/:orderId", (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.status(404).json({ error: "not found" });
  const params = {
    merchant_name: "TicketMaster",
    external_order_id: order.id,
    amount_cents: order.total_cents,
    return_url: `http://localhost:${PORT}/order/${order.id}`,
  };
  const sig = signParams(params);
  const qs = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    sig,
  });
  res.json({ url: `${SUNPAY_URL}/split/new?${qs}` });
});

// Demo reset: restore the order to pending and ask SunPay to purge the split
// so the whole flow can be run again identically. One click → repeatable demo.
app.post("/api/reset", async (req, res) => {
  const orderId = (req.body && req.body.order_id) || "ORD-8814";
  seedOrder(orderId);
  let sunpayCleared = false;
  try {
    const sig = signParams({ external_order_id: orderId });
    const r = await fetch(`${SUNPAY_URL}/api/demo/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ external_order_id: orderId, sig }),
    });
    sunpayCleared = r.ok;
  } catch (err) {
    console.warn("reset: SunPay purge failed (is :3000 up?)", err.message);
  }
  console.log(`order ${orderId} reset → pending (sunpay cleared: ${sunpayCleared})`);
  res.json({ ok: true, order_id: orderId, sunpay_cleared: sunpayCleared });
});

// SunPay's server-to-server settlement callback (§7.3) — flips the order.
app.post("/api/payment-callback", (req, res) => {
  const { sig, ...payload } = req.body || {};
  const { external_order_id, split_id, amount_cents, status } = payload;
  if (!verifyParams({ external_order_id, split_id, amount_cents, status }, sig)) {
    console.warn("payment-callback: bad signature — rejected");
    return res.status(403).json({ error: "bad signature" });
  }
  const order = orders.get(external_order_id);
  if (!order) return res.status(404).json({ error: "unknown order" });
  if (status === "settled" && Number(amount_cents) === order.total_cents) {
    order.status = "confirmed";
    order.paid_via = `SunPay (split ${split_id})`;
    console.log(`order ${order.id} → confirmed (paid via SunPay)`);
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: "unexpected payload" });
});

app.listen(PORT, () => {
  console.log(`TicketMaster demo → http://localhost:${PORT}/seats`);
  console.log(`seeded order ORD-8814 ($700.00), status pending`);
});

require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const Stripe = require("stripe");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// IMPORTANT: downloadable files stay in /private, outside the public web directory.
const PRODUCTS = {
  starter_ebook: {
    id: "starter_ebook",
    name: "Digital Creator Starter eBook",
    description: "A sample digital product listing. Replace with your real product.",
    priceCents: 900,
    file: path.join(__dirname, "private", "products", "sample-download.txt")
  },
  planner: {
    id: "planner",
    name: "Ultimate Digital Planner",
    description: "A sample planner listing. Replace with your real product.",
    priceCents: 1900,
    file: path.join(__dirname, "private", "products", "sample-download.txt")
  }
};

function getProduct(id) {
  return PRODUCTS[id] || null;
}

app.get("/api/products", (req, res) => {
  res.json(Object.values(PRODUCTS).map(({ id, name, description, priceCents }) => ({
    id, name, description, price: (priceCents / 100).toFixed(2), currency: "USD"
  })));
});

app.post("/api/checkout/stripe", async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured yet." });
    const product = getProduct(req.body.productId);
    if (!product) return res.status(400).json({ error: "Unknown product." });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: product.priceCents,
          product_data: { name: product.name, description: product.description }
        },
        quantity: 1
      }],
      metadata: { productId: product.id },
      success_url: `${BASE_URL}/success.html?provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?cancelled=1`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    res.status(500).json({ error: "Could not start checkout." });
  }
});

async function paypalAccessToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal is not configured.");
  const host = process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
  const response = await fetch(`${host}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "PayPal token request failed.");
  return { token: data.access_token, host };
}

app.post("/api/checkout/paypal", async (req, res) => {
  try {
    const product = getProduct(req.body.productId);
    if (!product) return res.status(400).json({ error: "Unknown product." });
    const { token, host } = await paypalAccessToken();
    const response = await fetch(`${host}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          custom_id: product.id,
          description: product.name,
          amount: { currency_code: "USD", value: (product.priceCents / 100).toFixed(2) }
        }],
        application_context: {
          brand_name: "DigitalVault",
          user_action: "PAY_NOW",
          return_url: `${BASE_URL}/success.html?provider=paypal`,
          cancel_url: `${BASE_URL}/?cancelled=1`
        }
      })
    });
    const order = await response.json();
    if (!response.ok) throw new Error(order.message || "PayPal order creation failed.");
    const approve = (order.links || []).find(link => link.rel === "approve");
    if (!approve) throw new Error("PayPal approval link missing.");
    res.json({ orderId: order.id, approveUrl: approve.href });
  } catch (err) {
    console.error("PayPal create order error:", err.message);
    res.status(500).json({ error: "Could not start PayPal checkout. Check your PayPal setup." });
  }
});

app.post("/api/checkout/paypal/capture", async (req, res) => {
  try {
    const orderId = String(req.body.orderId || "");
    if (!orderId) return res.status(400).json({ error: "Missing PayPal order ID." });
    const { token, host } = await paypalAccessToken();
    const response = await fetch(`${host}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "PayPal capture failed.");
    const unit = result.purchase_units && result.purchase_units[0];
    const product = unit && getProduct(unit.custom_id);
    const capture = unit && unit.payments && unit.payments.captures && unit.payments.captures[0];
    if (result.status !== "COMPLETED" || !product || !capture || capture.status !== "COMPLETED") {
      return res.status(402).json({ error: "Payment is not completed." });
    }
    res.json({ ok: true, productId: product.id });
  } catch (err) {
    console.error("PayPal capture error:", err.message);
    res.status(500).json({ error: "Could not verify/capture PayPal payment." });
  }
});

app.get("/api/download/stripe", async (req, res) => {
  try {
    if (!stripe) return res.status(503).send("Stripe is not configured.");
    const sessionId = String(req.query.session_id || "");
    if (!sessionId) return res.status(400).send("Missing checkout session.");
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return res.status(403).send("Payment not confirmed.");
    const product = getProduct(session.metadata && session.metadata.productId);
    if (!product) return res.status(404).send("Product not found.");
    return sendProductFile(product, res);
  } catch (err) {
    console.error("Stripe download verification error:", err.message);
    res.status(403).send("Could not verify payment. Contact support if you were charged.");
  }
});

// PayPal success page only asks for a download after the server has captured the order.
// This route independently checks the PayPal order/capture status before sending a file.
app.get("/api/download/paypal", async (req, res) => {
  try {
    const orderId = String(req.query.order_id || "");
    if (!orderId) return res.status(400).send("Missing PayPal order.");
    const { token, host } = await paypalAccessToken();
    const response = await fetch(`${host}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    });
    const order = await response.json();
    if (!response.ok) throw new Error(order.message || "Could not retrieve order.");
    const unit = order.purchase_units && order.purchase_units[0];
    const product = unit && getProduct(unit.custom_id);
    const capture = unit && unit.payments && unit.payments.captures && unit.payments.captures[0];
    if (order.status !== "COMPLETED" || !product || !capture || capture.status !== "COMPLETED") {
      return res.status(403).send("Payment not confirmed.");
    }
    return sendProductFile(product, res);
  } catch (err) {
    console.error("PayPal download verification error:", err.message);
    res.status(403).send("Could not verify payment. Contact support if you were charged.");
  }
});

function sendProductFile(product, res) {
  if (!fs.existsSync(product.file)) return res.status(404).send("Product file has not been uploaded yet.");
  res.setHeader("Cache-Control", "no-store");
  res.download(product.file, path.basename(product.file));
}

app.get("/success.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "success.html"));
});

app.listen(PORT, () => console.log(`DigitalVault running at ${BASE_URL}`));

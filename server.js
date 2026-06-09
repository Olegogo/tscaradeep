import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { getProducts } from "./cms.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 24 * 1024;

await loadDotEnv();

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"]
]);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const apiPath = normalizePath(url.pathname);

    if (req.method === "POST" && apiPath === "/api/order") {
      await handleOrder(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/products") {
      sendJson(res, 200, { ok: true, products: await getProducts() });
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    await serveStatic(url.pathname, res, req.method === "HEAD");
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, error: "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Tscaradeep catalog is running: http://${HOST}:${PORT}`);
});

async function handleOrder(req, res) {
  const body = await readRequestBody(req);
  const payload = JSON.parse(body || "{}");
  const products = await getProducts();
  const order = normalizeOrder(payload, products);

  if (!order.ok) {
    sendJson(res, 400, { ok: false, error: order.error });
    return;
  }

  const message = formatTelegramMessage(order.value);
  const hasTelegramConfig = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID;

  if (!hasTelegramConfig) {
    console.log("\nTelegram env is not configured. Demo order:");
    console.log(message.replaceAll(/<[^>]+>/g, ""));
    sendJson(res, 202, {
      ok: true,
      mode: "demo",
      message: "Заказ принят в демо-режиме. Добавьте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env."
    });
    return;
  }

  await sendTelegramMessage(message);
  sendJson(res, 200, {
    ok: true,
    mode: "telegram",
    message: "Заказ отправлен в Telegram."
  });
}

function normalizePath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/g, "") : pathname;
}

async function serveStatic(requestPath, res, headOnly) {
  const cleanPath = decodeURIComponent(requestPath.split("?")[0]);
  const relativePath = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const filePath = path.resolve(__dirname, relativePath);

  if (!filePath.startsWith(__dirname)) {
    sendJson(res, 403, { ok: false, error: "Forbidden" });
    return;
  }

  try {
    const contents = await readFile(filePath);
    const type = mimeTypes.get(path.extname(filePath)) || "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": relativePath.startsWith("assets/") ? "public, max-age=3600" : "no-store"
    });

    if (!headOnly) {
      res.end(contents);
    } else {
      res.end();
    }
  } catch {
    sendJson(res, 404, { ok: false, error: "Not found" });
  }
}

async function readRequestBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new Error("Request body is too large");
    }
  }

  return body;
}

function normalizeOrder(payload, products) {
  const product = products.find((item) => item.id === String(payload.productId || ""));
  const name = cleanText(payload.name, 80);
  const phone = cleanText(payload.phone, 40);
  const contact = cleanText(payload.contact, 80);
  const comment = cleanText(payload.comment, 500);
  const quantity = Number(payload.quantity || 1);

  if (!product) {
    return { ok: false, error: "Выберите товар." };
  }

  if (!name || !phone) {
    return { ok: false, error: "Укажите имя и телефон." };
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return { ok: false, error: "Количество должно быть от 1 до 20." };
  }

  return {
    ok: true,
    value: {
      id: crypto.randomUUID().slice(0, 8).toUpperCase(),
      createdAt: new Date(),
      product,
      quantity,
      total: product.price * quantity,
      customer: {
        name,
        phone,
        contact,
        comment
      }
    }
  };
}

function cleanText(value, limit) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, limit);
}

function formatTelegramMessage(order) {
  const lines = [
    "<b>Новый заказ Tscaradeep</b>",
    "",
    `<b>Товар:</b> ${escapeHtml(order.product.name)}`,
    `<b>Артикул:</b> ${escapeHtml(order.product.sku)}`,
    `<b>Кол-во:</b> ${order.quantity}`,
    `<b>Сумма:</b> ${formatPrice(order.total)}`,
    "",
    `<b>Имя:</b> ${escapeHtml(order.customer.name)}`,
    `<b>Телефон:</b> ${escapeHtml(order.customer.phone)}`
  ];

  if (order.customer.contact) {
    lines.push(`<b>Контакт:</b> ${escapeHtml(order.customer.contact)}`);
  }

  if (order.customer.comment) {
    lines.push(`<b>Комментарий:</b> ${escapeHtml(order.customer.comment)}`);
  }

  lines.push("", `<b>ID:</b> ${order.id}`, `<b>Время:</b> ${order.createdAt.toLocaleString("ru-RU")}`);
  return lines.join("\n");
}

function formatPrice(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function sendTelegramMessage(text) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${errorText}`);
  }
}

async function loadDotEnv() {
  try {
    const contents = await readFile(path.join(__dirname, ".env"), "utf8");

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional for local visual testing.
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(data));
}

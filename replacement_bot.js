// --- ENVIRONMENT VARIABLE LOADER ---
try {
  const fs = require("fs");
  const path = require("path");
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  }
} catch (e) {
  // Silent fallback if .env not present
}
// -----------------------------------

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// ─── Configuration ──────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.REPLACEMENT_BOT_TOKEN || "";
const BOT_USERNAME = process.env.REPLACEMENT_BOT_USERNAME || "mysterio_replacement_bot";
const ADMIN_ID = process.env.TELEGRAM_ADMIN_IDS ? Number(process.env.TELEGRAM_ADMIN_IDS.split(",")[0]) : 0;
const STORE_API_URL = process.env.STORE_API_URL || "http://localhost:3001";
const SECRET = process.env.REPLACEMENT_SECRET || "MysterioReplacementSecret2026";

const dataDir = path.join(__dirname, "data");
const stateFile = path.join(dataDir, "replacement_bot_state.json");

// ─── State ──────────────────────────────────────────────────────────────────
function loadState() {
  try { if (fs.existsSync(stateFile)) return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch {}
  return { offset: 0 };
}
function saveState(s) {
  try { fs.writeFileSync(stateFile, JSON.stringify(s, null, 2), "utf8"); } catch {}
}

// ─── Telegram API ───────────────────────────────────────────────────────────
function tg(method, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: "api.telegram.org", port: 443,
      path: `/bot${BOT_TOKEN}/${method}`, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    }, (res) => {
      let body = ""; res.on("data", c => body += c);
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({ ok: false }); } });
    });
    req.on("error", () => resolve({ ok: false }));
    req.setTimeout(25000, () => { req.destroy(); resolve({ ok: false }); });
    req.write(data); req.end();
  });
}

// ─── Store API ──────────────────────────────────────────────────────────────
function storeApi(pathStr, method = "GET", payload = null) {
  return new Promise((resolve) => {
    const parsed = new URL(`${STORE_API_URL}${pathStr}`);
    const data = payload ? JSON.stringify(payload) : "";
    const opts = {
      hostname: parsed.hostname, port: parsed.port || 80,
      path: parsed.pathname + parsed.search, method,
      headers: { "Content-Type": "application/json" }
    };
    if (payload) opts.headers["Content-Length"] = Buffer.byteLength(data);
    const req = http.request(opts, (res) => {
      let body = ""; res.on("data", c => body += c);
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({ error: "Parse error" }); } });
    });
    req.on("error", (e) => resolve({ error: e.message }));
    if (payload) req.write(data);
    req.end();
  });
}

// ─── HTML escape ────────────────────────────────────────────────────────────
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// ─── Format helpers ─────────────────────────────────────────────────────────
function maskCreds(creds) {
  if (!creds) return "N/A";
  const s = String(creds);
  // Show first 6 and last 4 chars, mask middle
  if (s.length <= 12) return s.substring(0, 4) + "****" + s.substring(s.length - 4);
  return s.substring(0, 6) + "****" + s.substring(s.length - 4);
}

function timeLeft(expiresAt) {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "EXPIRED";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  if (hrs > 0) return `${hrs}h ${m}m`;
  return `${m}m`;
}

// ─── Handle Updates ─────────────────────────────────────────────────────────
async function handleUpdate(update) {

  // ── TEXT MESSAGES ──
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();

    // /start with deep link
    if (text.startsWith("/start")) {
      const parts = text.split(" ");

      // Deep link: /start order_ORD-XXXX
      if (parts.length > 1 && parts[1].startsWith("order_")) {
        const orderId = parts[1].substring(6);
        await showOrder(chatId, orderId);
        return;
      }

      // Normal /start
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🔄 <b>Falcon Logs Replacement Bot</b>\n\n` +
          `Welcome! This bot handles automatic replacements for your purchases.\n\n` +
          `<b>How to use:</b>\n` +
          `1️⃣ Go to your <b>Orders</b> page on Falcon Logs\n` +
          `2️⃣ Click the <b>\"Replace\"</b> button on any eligible item\n` +
          `3️⃣ You'll be redirected here with your order loaded\n` +
          `4️⃣ Tap the item you want replaced\n` +
          `5️⃣ Get your replacement instantly!\n\n` +
          `Or send your order ID directly: <code>/order ORD-XXXXXXXX</code>\n\n` +
          `⏱ Replacements must be requested within the refund window shown on each item.`,
        parse_mode: "HTML"
      });
      return;
    }

    // /order ORD-XXXX
    if (text.startsWith("/order ")) {
      const orderId = text.split(" ")[1];
      if (!orderId) {
        await tg("sendMessage", { chat_id: chatId, text: "⚠️ Usage: <code>/order ORD-XXXXXXXX</code>", parse_mode: "HTML" });
        return;
      }
      await showOrder(chatId, orderId);
      return;
    }

    // /myorders — show recent orders
    if (text === "/myorders" || text === "/orders") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "📦 To view your orders and request replacements, visit:\n\n🌐 <b>Orders Page</b>\n\nThen click <b>Replace</b> on any eligible item to open it here.",
        parse_mode: "HTML"
      });
      return;
    }

    // /help
    if (text === "/help") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `📋 <b>Available Commands</b>\n\n` +
          `/order &lt;ID&gt; — Load order and view items\n` +
          `/help — Show this help message\n\n` +
          `<b>Automatic Replacement:</b>\n` +
          `• Items are replaced instantly with matching stock\n` +
          `• If no matching stock is available, your balance is credited instead\n` +
          `• Each item can only be replaced once\n` +
          `• Replacements must be within the refund window`,
        parse_mode: "HTML"
      });
      return;
    }

    // Unknown
    if (text.startsWith("/")) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "❓ Unknown command. Use /help for available commands.\n\nTo check an order: <code>/order ORD-XXXXXXXX</code>",
        parse_mode: "HTML"
      });
    }
    return;
  }

  // ── CALLBACK QUERIES (inline buttons) ──
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    const data = String(cq.data || "");

    // replace:ORDER_ID:ITEM_INDEX
    if (data.startsWith("replace:")) {
      const [, orderId, idxStr] = data.split(":");
      const itemIndex = parseInt(idxStr, 10);
      await handleReplacement(cq, chatId, orderId, itemIndex);
      return;
    }

    // refresh:ORDER_ID
    if (data.startsWith("refresh:")) {
      const orderId = data.split(":")[1];
      await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Refreshing..." });
      await showOrder(chatId, orderId);
      return;
    }

    await tg("answerCallbackQuery", { callback_query_id: cq.id });
  }
}

// ─── Show order with replaceable items ──────────────────────────────────────
async function showOrder(chatId, orderId) {
  const res = await storeApi(`/api/bot/order?orderId=${orderId}&secret=${SECRET}`);

  if (res.error || !res.order) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `❌ <b>Order Not Found</b>\n\nCould not find order <code>${esc(orderId)}</code>.\nMake sure the order ID is correct.`,
      parse_mode: "HTML"
    });
    return;
  }

  const order = res.order;

  if (order.status !== "COMPLETED") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `⚠️ <b>Order ${esc(orderId)}</b>\n\nStatus: <b>${esc(order.status)}</b>\n\nReplacements are only available for completed orders.`,
      parse_mode: "HTML"
    });
    return;
  }

  const now = Date.now();
  const deliveredAt = new Date(order.createdAt).getTime();

  let msg = `📦 <b>Order ${esc(order.id)}</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  const buttons = [];

  order.items.forEach((item, idx) => {
    const windowHours = Number(item.refundWindowHours) > 0 ? Number(item.refundWindowHours) : 24;
    const expiresAt = deliveredAt + windowHours * 3600 * 1000;
    const isExpired = now > expiresAt;
    const isRefundable = item.refundable !== false;
    const isReplaced = item.replaced === true;
    const isRefunded = item.refundedToBalance > 0;

    // Status indicator
    let statusIcon, statusText;
    if (isReplaced) {
      statusIcon = "🔄";
      statusText = isRefunded ? `Refunded $${item.refundedToBalance.toFixed(2)} to balance` : "Replaced";
    } else if (!isRefundable) {
      statusIcon = "🚫";
      statusText = "Non-refundable";
    } else if (isExpired) {
      statusIcon = "⏰";
      statusText = "Window expired";
    } else {
      statusIcon = "✅";
      statusText = `${timeLeft(expiresAt)} remaining`;
    }

    const itemType = item.type === "stock" ? "💳" : "📄";
    const credPreview = maskCreds(item.credentials);

    msg += `${itemType} <b>Item ${idx + 1}:</b> ${esc(item.name)}\n`;
    msg += `💰 $${Number(item.price).toFixed(2)}\n`;
    msg += `🔑 <code>${esc(credPreview)}</code>\n`;
    msg += `${statusIcon} ${statusText}\n\n`;

    // Add replace button only if eligible
    if (!isReplaced && isRefundable && !isExpired) {
      buttons.push([{
        text: `🔄 Replace Item ${idx + 1} — ${item.name}`,
        callback_data: `replace:${order.id}:${idx}`
      }]);
    }
  });

  if (buttons.length === 0) {
    msg += `\n<i>No items eligible for replacement.</i>`;
  } else {
    msg += `\n<i>Tap an item below to get an instant replacement:</i>`;
  }

  // Add refresh button
  buttons.push([{ text: "🔃 Refresh Order", callback_data: `refresh:${order.id}` }]);

  await tg("sendMessage", {
    chat_id: chatId,
    text: msg,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
}

// ─── Handle replacement request ─────────────────────────────────────────────
async function handleReplacement(cq, chatId, orderId, itemIndex) {
  // Show processing
  await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "⏳ Processing replacement..." });

  // Send a "working" message
  const workingMsg = await tg("sendMessage", {
    chat_id: chatId,
    text: "⏳ <b>Processing replacement...</b>\n\nSearching for matching stock...",
    parse_mode: "HTML"
  });

  // Call store API to perform replacement
  const result = await storeApi("/api/bot/replace-item", "POST", {
    secret: SECRET,
    orderId,
    itemIndex
  });

  if (result.success) {
    // Replacement successful!
    const msgText = `✅ <b>Replacement Successful!</b>\n\n` +
      `📦 Order: <code>${esc(orderId)}</code>\n` +
      `🆕 New item: <b>${esc(result.newName || "Replacement")}</b>\n\n` +
      `🔑 <b>New Credentials:</b>\n` +
      `<code>${esc(result.newCredentials)}</code>\n\n` +
      `<i>This item cannot be replaced again.</i>`;

    // Edit the working message
    if (workingMsg.ok) {
      await tg("editMessageText", {
        chat_id: chatId,
        message_id: workingMsg.result.message_id,
        text: msgText,
        parse_mode: "HTML"
      });
    } else {
      await tg("sendMessage", { chat_id: chatId, text: msgText, parse_mode: "HTML" });
    }

    // Notify admin
    await tg("sendMessage", {
      chat_id: ADMIN_ID,
      text: `🔄 <b>Auto-Replacement Processed</b>\n\n` +
        `Order: <code>${esc(orderId)}</code>\n` +
        `Item #${itemIndex + 1}\n` +
        `New: <code>${esc(maskCreds(result.newCredentials))}</code>`,
      parse_mode: "HTML"
    });

    return;
  }

  // Replacement failed — check if we should refund to balance instead
  if (result.refundInstead) {
    const refundAmt = Number(result.refundAmount || 0);

    // Fetch the order to get userId
    const orderRes = await storeApi(`/api/bot/order?orderId=${orderId}&secret=${SECRET}`);
    if (orderRes.order) {
      const refundResult = await storeApi("/api/bot/refund-balance", "POST", {
        secret: SECRET,
        userId: orderRes.order.userId,
        amount: refundAmt,
        orderId,
        itemIndex
      });

      if (refundResult.success) {
        const msgText = `💰 <b>Balance Refund Issued</b>\n\n` +
          `📦 Order: <code>${esc(orderId)}</code>\n` +
          `No matching replacement stock was available.\n\n` +
          `💵 <b>$${refundAmt.toFixed(2)}</b> has been added to your store balance.\n` +
          `New balance: <b>$${Number(refundResult.newBalance).toFixed(2)}</b>\n\n` +
          `<i>You can use your balance on your next purchase.</i>`;

        if (workingMsg.ok) {
          await tg("editMessageText", {
            chat_id: chatId, message_id: workingMsg.result.message_id,
            text: msgText, parse_mode: "HTML"
          });
        } else {
          await tg("sendMessage", { chat_id: chatId, text: msgText, parse_mode: "HTML" });
        }

        // Notify admin
        await tg("sendMessage", {
          chat_id: ADMIN_ID,
          text: `💰 <b>Balance Refund (No Stock)</b>\n\n` +
            `Order: <code>${esc(orderId)}</code>\n` +
            `Amount: $${refundAmt.toFixed(2)}\n` +
            `User balance: $${Number(refundResult.newBalance).toFixed(2)}`,
          parse_mode: "HTML"
        });
        return;
      }
    }
  }

  // Generic error
  const errorText = `❌ <b>Replacement Failed</b>\n\n` +
    `${esc(result.error || "An unknown error occurred.")}\n\n` +
    `Please contact support with your order ID: <code>${esc(orderId)}</code>`;

  if (workingMsg.ok) {
    await tg("editMessageText", {
      chat_id: chatId, message_id: workingMsg.result.message_id,
      text: errorText, parse_mode: "HTML"
    });
  } else {
    await tg("sendMessage", { chat_id: chatId, text: errorText, parse_mode: "HTML" });
  }
}

// ─── Main loop ──────────────────────────────────────────────────────────────
async function runBot() {
  console.log("🔄 Starting Falcon Logs Replacement Bot (Auto-Replace)...");
  console.log(`   Bot: @${BOT_USERNAME}`);
  console.log(`   Admin notifications: ${ADMIN_ID}`);

  const state = loadState();

  // Sync offset
  try {
    const res = await tg("getUpdates", { offset: -1, limit: 1 });
    if (res?.ok && res.result.length > 0) state.offset = res.result[0].update_id + 1;
  } catch {}

  // Set bot commands
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Start the bot" },
      { command: "order", description: "Check an order — /order ORD-XXXX" },
      { command: "help", description: "How to use this bot" }
    ]
  });

  // Long-polling loop
  while (true) {
    try {
      const response = await tg("getUpdates", {
        offset: state.offset,
        timeout: 15,
        allowed_updates: ["message", "callback_query"]
      });

      if (response?.ok && Array.isArray(response.result)) {
        for (const update of response.result) {
          try { await handleUpdate(update); }
          catch (err) { console.error("[Replace Bot] Error:", err.message); }
          if (update.update_id >= state.offset) state.offset = update.update_id + 1;
        }
        saveState(state);
      } else {
        if (response?.description) console.error("[Replace Bot]", response.description);
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (err) {
      console.error("[Replace Bot] Loop error:", err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

runBot();

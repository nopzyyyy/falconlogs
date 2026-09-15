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

const BOT_TOKEN = process.env.SUCCESS_BOT_TOKEN || "";
const ADMIN_IDS = process.env.TELEGRAM_ADMIN_IDS ? process.env.TELEGRAM_ADMIN_IDS.split(",").map(s => s.trim()).filter(Boolean) : [];

const dataDir = path.join(__dirname, "data");
const stateFile = path.join(dataDir, "success_bot_state.json");
const ordersFile = path.join(dataDir, "orders.json");

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// State management
function loadState() {
  try {
    if (fs.existsSync(stateFile)) {
      const content = fs.readFileSync(stateFile, "utf8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Error reading state file:", err.message);
  }
  return { offset: 0 };
}

function saveState(state) {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing state file:", err.message);
  }
}

function isAdmin(chatId) {
  return ADMIN_IDS.includes(Number(chatId)) || ADMIN_IDS.includes(String(chatId));
}

function telegramApi(method, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${BOT_TOKEN}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ ok: false, description: "Failed to parse API response" });
        }
      });
    });

    req.on("error", (err) => {
      console.error(`Telegram API request error (${method}):`, err.message);
      resolve({ ok: false, error: err.message });
    });

    req.write(data);
    req.end();
  });
}

// Handle incoming messages
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // Validate admin
  if (!isAdmin(chatId)) {
    console.log(`[Success Bot] Unauthorized access attempt by Chat ID: ${chatId}`);
    return;
  }

  if (text.startsWith("/start")) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "👋 Welcome to the <b>Mysterio Fulfillment Bot</b>!\n\nI will notify you when buyers pay for custom setup products. To complete an order, use: \n<code>/done &lt;orderID&gt;</code>",
      parse_mode: "HTML"
    });
    return;
  }

  if (text.startsWith("/done")) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "❌ <b>Usage:</b> <code>/done &lt;orderID&gt;</code>\nExample: <code>/done ORD-A1B2C3D4</code>",
        parse_mode: "HTML"
      });
      return;
    }

    let inputId = parts[1].toUpperCase();
    if (!inputId.startsWith("ORD-")) {
      inputId = "ORD-" + inputId;
    }

    try {
      if (!fs.existsSync(ordersFile)) {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: "❌ Orders database not found.",
          parse_mode: "HTML"
        });
        return;
      }

      const ordersContent = fs.readFileSync(ordersFile, "utf8");
      const orders = JSON.parse(ordersContent || "[]");
      const order = orders.find(o => o.id === inputId);

      if (!order) {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: `❌ Order <b>${inputId}</b> not found in database.`,
          parse_mode: "HTML"
        });
        return;
      }

      if (order.status === "COMPLETED") {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: `ℹ️ Order <b>${inputId}</b> is already completed/delivered.`,
          parse_mode: "HTML"
        });
        return;
      }

      if (order.status !== "PROCESSING") {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: `⚠️ Order <b>${inputId}</b> cannot be completed (Current status: <code>${order.status}</code>).`,
          parse_mode: "HTML"
        });
        return;
      }

      // Update order status and item credentials
      order.status = "COMPLETED";
      order.items.forEach(item => {
        if (item.type === "custom-product") {
          item.credentials = "Fulfillment completed by Administrator. Enjoy your access!";
        }
      });

      fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2), "utf8");

      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: `✅ Order <b>${inputId}</b> has been successfully marked as <b>COMPLETED</b> and customer credentials have been updated.`,
        parse_mode: "HTML"
      });

    } catch (err) {
      console.error("[Success Bot] Error completing order:", err);
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: `❌ An error occurred: ${err.message}`,
        parse_mode: "HTML"
      });
    }
  }
}

// Offset correction
async function alignOffset(state) {
  const response = await telegramApi("getUpdates", {
    offset: -1,
    limit: 1
  });
  if (response && response.ok && Array.isArray(response.result) && response.result.length > 0) {
    const latestId = response.result[0].update_id;
    if (Math.abs(state.offset - latestId) > 5000) {
      state.offset = latestId;
      saveState(state);
    }
  }
}

// Bot main loop
async function runBot() {
  console.log("Starting Mysterio Fulfillment Bot...");
  const state = loadState();

  try {
    await alignOffset(state);
  } catch (err) {
    console.error("Error aligning offset:", err.message);
  }

  while (true) {
    try {
      const response = await telegramApi("getUpdates", {
        offset: state.offset,
        timeout: 15,
        allowed_updates: ["message"]
      });

      if (response && response.ok && Array.isArray(response.result)) {
        for (const update of response.result) {
          if (update.message) {
            try {
              await handleMessage(update.message);
            } catch (err) {
              console.error("Error handling message:", err);
            }
          }
          if (update.update_id >= state.offset) {
            state.offset = update.update_id + 1;
            saveState(state);
          }
        }
      } else {
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (err) {
      console.error("Error in bot loop:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

runBot();

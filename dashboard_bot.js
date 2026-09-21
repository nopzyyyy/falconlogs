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
const crypto = require("crypto");

// --- Configuration ---
const BOT_TOKEN = process.env.DASHBOARD_BOT_TOKEN || "";
const ADMIN_IDS = process.env.TELEGRAM_ADMIN_IDS ? process.env.TELEGRAM_ADMIN_IDS.split(",").map(s => s.trim()).filter(Boolean) : [];

const dataDir = path.join(__dirname, "data");
const usersFile = path.join(dataDir, "users.json");
const ordersFile = path.join(dataDir, "orders.json");

// Ensure data folder exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// --- JSON File Helpers ---
function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8") || JSON.stringify(fallback));
    }
  } catch (err) {
    console.error(`Error reading file ${file}:`, err.message);
  }
  return fallback;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`Error writing file ${file}:`, err.message);
  }
}

// --- Telegram API Helper ---
function tgApi(method, payload) {
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
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ ok: false, error: "Parse error" });
        }
      });
    });

    req.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ ok: false, error: "Timeout" });
    });

    req.write(data);
    req.end();
  });
}

// --- Bot Commands Handlers ---
async function handleStart(chatId, fromUser, fullText = "") {
  const users = readJson(usersFile, []);
  const fromId = fromUser.id;
  const username = fromUser.username || "";

  // 1. Check if they passed a parameter (like an order ID)
  const parts = fullText.split(/\s+/);
  let orderParam = null;
  if (parts.length > 1) {
    orderParam = parts[1].trim().toUpperCase();
    if (orderParam && !orderParam.startsWith("ORD-")) {
      orderParam = "ORD-" + orderParam;
    }
  }

  // Find if they already have a user in our system
  let user = users.find(u => u.telegramId === fromId);

  // If there's an order parameter, look it up in orders.json
  let linkedOrder = null;
  if (orderParam) {
    const orders = readJson(ordersFile, []);
    linkedOrder = orders.find(o => o.id.toUpperCase() === orderParam);
    
    if (linkedOrder) {
      if (user) {
        // If the Telegram user already has a registered account, assign the order to their account!
        linkedOrder.userId = user.id;
        writeJson(ordersFile, orders);
      } else {
        // Find the user currently assigned to the order
        let orderUser = users.find(u => u.id === linkedOrder.userId);
        if (orderUser) {
          // Link this Telegram ID to that user account!
          orderUser.telegramId = fromId;
          orderUser.telegramUsername = username;
          if (!orderUser.telegramToken) {
            orderUser.telegramToken = `TG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
          }
          user = orderUser;
          writeJson(usersFile, users);
        }
      }
    }
  }

  // If still no user exists, create a new one
  if (!user) {
    const token = `TG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    user = {
      id: crypto.randomUUID(),
      email: `tg_${fromId}@falconlogs.com`,
      passwordHash: "",
      role: "USER",
      balance: 0,
      createdAt: new Date().toISOString(),
      telegramId: fromId,
      telegramUsername: username,
      telegramToken: token
    };
    users.push(user);
    writeJson(usersFile, users);

    // If they had an order, bind it to this new user account now!
    if (linkedOrder) {
      const orders = readJson(ordersFile, []);
      const orderRef = orders.find(o => o.id.toUpperCase() === linkedOrder.id.toUpperCase());
      if (orderRef) {
        orderRef.userId = user.id;
        writeJson(ordersFile, orders);
        linkedOrder = orderRef;
      }
    }
  }

  // Ensure they have a token
  if (!user.telegramToken) {
    user.telegramToken = `TG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    writeJson(usersFile, users);
  }

  // Welcome response
  let welcomeMessage = `<b>Welcome to Falcon Logs Dashboard Bot!</b>\n\n` +
    `Your Telegram account is linked. Here is your unique Login Token:\n\n` +
    `<code>${user.telegramToken}</code>\n\n` +
    `<i>Tap/click the token code above to copy it instantly.</i>\n\n` +
    `Paste this token into the "Sign in with Telegram" popup on the website to login.\n\n`;

  if (linkedOrder) {
    welcomeMessage += `<b>📦 Order Details for ${linkedOrder.id}:</b>\n`;
    const dateStr = linkedOrder.createdAt ? new Date(linkedOrder.createdAt).toLocaleDateString() : "N/A";
    const statusLabel = linkedOrder.status === "COMPLETED" ? "COMPLETED" : linkedOrder.status === "PROCESSING" ? "PROCESSING (Manual Delivery)" : linkedOrder.status;
    
    welcomeMessage += `• <b>Status:</b> <code>${statusLabel}</code>\n` +
      `• <b>Date:</b> ${dateStr}\n` +
      `• <b>Total:</b> £${Number(linkedOrder.total || 0).toFixed(2)}\n\n`;

    if (linkedOrder.status === "COMPLETED") {
      welcomeMessage += `<b>Fulfillment Details:</b>\n`;
      linkedOrder.items.forEach((item, index) => {
        welcomeMessage += `\n<u>Item #${index + 1}: ${item.name}</u>\n`;
        const creds = item.credentials || "";
        const emailPassRegex = /^([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}):(.+)$/;
        
        if (emailPassRegex.test(creds.trim())) {
          const match = creds.trim().match(emailPassRegex);
          welcomeMessage += `📧 <b>Email:</b> <code>${match[1]}</code>\n` +
                            `🔑 <b>Password:</b> <code>${match[2]}</code>\n`;
        } else if (creds.startsWith("http://") || creds.startsWith("https://")) {
          welcomeMessage += `🔗 <b>Link:</b> ${creds}\n`;
        } else {
          welcomeMessage += `📄 <b>Credentials:</b>\n<code>${creds}</code>\n`;
        }
      });
    } else if (linkedOrder.status === "PROCESSING") {
      welcomeMessage += `⏳ <i>Your order is currently processing. Our staff have been notified and will deliver it to this chat shortly. Keep an eye on updates here!</i>\n\n`;
    } else {
      welcomeMessage += `⚠️ <i>Payment is pending. Please complete your checkout on the website.</i>\n\n`;
    }
  }

  welcomeMessage += `<b>Commands:</b>\n` +
    `/status - Check your latest order status\n` +
    `/help - View help information\n\n` +
    `📢 Join @falconlogs for updates and free drops!`;

  await tgApi("sendMessage", {
    chat_id: chatId,
    text: welcomeMessage,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}

async function handleStatus(chatId, fromUser) {
  const users = readJson(usersFile, []);
  const user = users.find(u => u.telegramId === fromUser.id);

  if (!user) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: "You have not linked your Telegram account yet. Please send /start first.\n\n📢 Join @falconlogs for updates and free drops!",
      parse_mode: "HTML"
    });
    return;
  }

  const orders = readJson(ordersFile, []);
  const userOrders = orders.filter(o => o.userId === user.id).slice(0, 5); // Latest 5 orders

  if (userOrders.length === 0) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: "You have no orders placed on Falcon Logs yet.\n\n📢 Join @falconlogs for updates and free drops!",
      parse_mode: "HTML"
    });
    return;
  }

  let text = `<b>Your Latest Orders:</b>\n\n`;
  userOrders.forEach(o => {
    const dateStr = o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "N/A";
    const statusLabel = o.status === "COMPLETED" ? "[COMPLETED]" : o.status === "WAITING_PAYMENT" ? "[PENDING PAYMENT]" : `[${o.status}]`;
    
    text += `<b>Order ID:</b> <code>${o.id}</code>\n` +
      `  <b>Date:</b> ${dateStr}\n` +
      `  <b>Amount:</b> £${Number(o.total || 0).toFixed(2)}\n` +
      `  <b>Status:</b> <code>${statusLabel}</code>\n\n`;
  });

  text += `📢 Join @falconlogs for updates and free drops!`;

  await tgApi("sendMessage", {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  });
}

async function handleHelp(chatId) {
  const helpText = `<b>Falcon Logs Dashboard Bot Help</b>\n\n` +
    `This bot links your Telegram account to Falcon Logs for instant login and real-time order alerts.\n\n` +
    `<b>Available Commands:</b>\n` +
    `/start - Connect your account and get a Login Token\n` +
    `/status - Check the status of your last 5 orders\n` +
    `/help - Display this help text\n\n` +
    `📢 Join @falconlogs for updates and free drops!`;

  await tgApi("sendMessage", {
    chat_id: chatId,
    text: helpText,
    parse_mode: "HTML"
  });
}

async function handleComplete(chatId, fromUser, text) {
  if (fromUser.id !== 6926823977) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: "❌ <b>Unauthorized:</b> Only the primary administrator (@FalconLogsAdmin) can complete orders.\n\n📢 Join @falconlogs for updates and free drops!",
      parse_mode: "HTML"
    });
    return;
  }

  const parts = text.split(/\s+/);
  if (parts.length < 3) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: "❌ <b>Invalid Usage:</b> Use <code>/complete &lt;orderid&gt; &lt;details&gt;</code>\n\n📢 Join @falconlogs for updates and free drops!",
      parse_mode: "HTML"
    });
    return;
  }

  const orderId = parts[1].trim();
  const detailsStartIndex = text.indexOf(orderId) + orderId.length;
  const details = text.substring(detailsStartIndex).trim();

  const orders = readJson(ordersFile, []);
  const order = orders.find(o => o.id.toLowerCase() === orderId.toLowerCase());

  if (!order) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: `❌ <b>Error:</b> Order <code>${orderId}</code> not found.\n\n📢 Join @falconlogs for updates and free drops!`,
      parse_mode: "HTML"
    });
    return;
  }

  if (order.status === "COMPLETED") {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: `⚠️ <b>Notice:</b> Order <code>${order.id}</code> is already completed.\n\n📢 Join @falconlogs for updates and free drops!`,
      parse_mode: "HTML"
    });
    return;
  }

  order.status = "COMPLETED";
  order.completedAt = new Date().toISOString();

  const item = (order.items || []).find(i => i.type === "custom-product");
  if (item) {
    item.credentials = details;
  } else {
    order.items = order.items || [];
    order.items.push({
      type: "custom-product",
      name: "Manual Delivery Asset",
      price: 0,
      credentials: details
    });
  }

  writeJson(ordersFile, orders);

  await tgApi("sendMessage", {
    chat_id: chatId,
    text: `✅ <b>Success:</b> Order <code>${order.id}</code> completed and buyer notified.\n\n📢 Join @falconlogs for updates and free drops!`,
    parse_mode: "HTML"
  });

  const buyer = users.find(u => u.id === order.userId);
  if (buyer && buyer.telegramId) {
    let buyerMessage = "";
    const detailsClean = details.trim();
    const accountRegex = /^([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}):(.+)$/;
    const match = detailsClean.match(accountRegex);
    
    if (match) {
      const email = match[1];
      const pass = match[2];
      buyerMessage = `<b>🎉 Your Order is Completed!</b>\n\n` +
        `<b>Order ID:</b> <code>${order.id}</code>\n\n` +
        `<b>Account Details:</b>\n` +
        `📧 <b>Email:</b> <code>${email}</code>\n` +
        `🔑 <b>Password:</b> <code>${pass}</code>\n\n` +
        `Thank you for purchasing!`;
    } else {
      buyerMessage = `<b>🎉 Your Order is Completed!</b>\n\n` +
        `<b>Order ID:</b> <code>${order.id}</code>\n\n` +
        `<b>Your Invitation/Delivery Link:</b>\n` +
        `🔗 ${detailsClean}\n\n` +
        `Thank you for purchasing!`;
    }
    
    buyerMessage += `\n\n📢 Join @falconlogs for updates and free drops!`;

    await tgApi("sendMessage", {
      chat_id: buyer.telegramId,
      text: buyerMessage,
      parse_mode: "HTML"
    });
  }
}

async function handleDone(chatId, fromUser, text) {
  if (fromUser.id !== 6926823977) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: "❌ <b>Unauthorized:</b> Only the primary administrator (@FalconLogsAdmin) can complete orders.\n\n📢 Join @falconlogs for updates and free drops!",
      parse_mode: "HTML"
    });
    return;
  }

  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: "❌ <b>Usage:</b> <code>/done &lt;orderID&gt;</code>\nExample: <code>/done ORD-A1B2C3D4</code>\n\n📢 Join @falconlogs for updates and free drops!",
      parse_mode: "HTML"
    });
    return;
  }

  let inputId = parts[1].toUpperCase();
  if (!inputId.startsWith("ORD-")) {
    inputId = "ORD-" + inputId;
  }

  const orders = readJson(ordersFile, []);
  const order = orders.find(o => o.id.toUpperCase() === inputId);

  if (!order) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: `❌ Order <b>${inputId}</b> not found in database.\n\n📢 Join @falconlogs for updates and free drops!`,
      parse_mode: "HTML"
    });
    return;
  }

  if (order.status === "COMPLETED") {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: `ℹ️ Order <b>${inputId}</b> is already completed/delivered.\n\n📢 Join @falconlogs for updates and free drops!`,
      parse_mode: "HTML"
    });
    return;
  }

  if (order.status !== "PROCESSING") {
    await tgApi("sendMessage", {
      chat_id: chatId,
      text: `⚠️ Order <b>${inputId}</b> cannot be completed (Current status: <code>${order.status}</code>).\n\n📢 Join @falconlogs for updates and free drops!`,
      parse_mode: "HTML"
    });
    return;
  }

  order.status = "COMPLETED";
  order.completedAt = new Date().toISOString();
  order.items.forEach(item => {
    if (item.type === "custom-product") {
      item.credentials = "Fulfillment completed by Administrator. Enjoy your access!";
    }
  });

  writeJson(ordersFile, orders);

  await tgApi("sendMessage", {
    chat_id: chatId,
    text: `✅ Order <b>${inputId}</b> has been successfully marked as <b>COMPLETED</b>.\n\n📢 Join @falconlogs for updates and free drops!`,
    parse_mode: "HTML"
  });

  const buyer = users.find(u => u.id === order.userId);
  if (buyer && buyer.telegramId) {
    const buyerMessage = `<b>🎉 Your Order is Completed!</b>\n\n` +
      `<b>Order ID:</b> <code>${order.id}</code>\n\n` +
      `Fulfillment completed by Administrator. Enjoy your access!\n\n` +
      `📢 Join @falconlogs for updates and free drops!`;

    await tgApi("sendMessage", {
      chat_id: buyer.telegramId,
      text: buyerMessage,
      parse_mode: "HTML"
    });
  }
}

async function handleUpdate(update) {
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const fromUser = update.message.from;

    if (!fromUser) return;

    if (text.startsWith("/start")) {
      await handleStart(chatId, fromUser, text);
    } else if (text.startsWith("/status") || text.startsWith("/orders")) {
      await handleStatus(chatId, fromUser);
    } else if (text.startsWith("/complete")) {
      await handleComplete(chatId, fromUser, text);
    } else if (text.startsWith("/done")) {
      await handleDone(chatId, fromUser, text);
    } else if (text.startsWith("/help")) {
      await handleHelp(chatId);
    } else {
      // Default fallback message
      await tgApi("sendMessage", {
        chat_id: chatId,
        text: "❓ Unknown command. Send /help to see available commands.\n\n📢 Join @falconlogs for updates and free drops!",
        parse_mode: "HTML"
      });
    }
  }
}

// --- Main Polling Loop ---
let offset = 0;
let pollingActive = true;

async function pollUpdates() {
  while (pollingActive) {
    try {
      const res = await tgApi("getUpdates", {
        offset: offset,
        timeout: 20
      });

      if (res && res.ok && Array.isArray(res.result)) {
        for (const update of res.result) {
          offset = update.update_id + 1;
          await handleUpdate(update);
        }
      } else {
        // If API fails or rate limit hit, sleep briefly
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (err) {
      console.error("Polling error:", err.message);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}

console.log("Falcon Logs Dashboard Bot starting...");
pollUpdates();

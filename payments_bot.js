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

const https = require("https");

const BOT_TOKEN = process.env.PAYMENTS_BOT_TOKEN || "";
const STARS_SECRET = process.env.STARS_SECRET || "FalconLogsStarsSecret2026";
const STORE_API_URL = process.env.STORE_API_URL || "http://localhost:3001";

// Helper to send HTTP requests to the local storefront API
function localApi(path, method = "GET", payload = null) {
  return new Promise((resolve, reject) => {
    const url = `${STORE_API_URL}${path}`;
    const parsedUrl = new URL(url);
    const data = payload ? JSON.stringify(payload) : "";

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: {
        "Content-Type": "application/json"
      }
    };

    if (payload) {
      options.headers["Content-Length"] = Buffer.byteLength(data);
    }

    const http = require("http");
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ error: "Failed to parse API response" });
        }
      });
    });

    req.on("error", (err) => {
      console.error(`Store API error (${path}):`, err.message);
      resolve({ error: err.message });
    });

    if (payload) {
      req.write(data);
    }
    req.end();
  });
}

// Telegram API Helper (POST JSON)
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
      console.error(`Telegram API error (${method}):`, err.message);
      resolve({ ok: false, error: err.message });
    });

    req.setTimeout(25000, () => {
      req.destroy();
      resolve({ ok: false, error: "Timeout" });
    });

    req.write(data);
    req.end();
  });
}

// Processes updates received from Telegram
async function handleUpdate(update, state) {
  // 1. Handle incoming private messages (including deep links)
  if (update.message && update.message.chat && update.message.chat.type === "private") {
    const chatId = update.message.chat.id;
    const text = (update.message.text || "").trim();

    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      if (parts.length > 1 && parts[1].startsWith("order_")) {
        const orderId = parts[1].substring(6); // extract ORD-XXXX
        console.log(`[Bot] Order deep-link received: ID=${orderId} for Chat=${chatId}`);

        // Fetch order details from local storefront server
        const details = await localApi(`/api/orders/details-stars?orderId=${orderId}&secret=${STARS_SECRET}`);
        
        if (details.error) {
          await telegramApi("sendMessage", {
            chat_id: chatId,
            text: `❌ <b>Order Not Found</b>\n\nWe couldn't retrieve the details for order ID <code>${orderId}</code>. It may have expired or been deleted.`,
            parse_mode: "HTML"
          });
          return;
        }

        if (details.status === "COMPLETED") {
          await telegramApi("sendMessage", {
            chat_id: chatId,
            text: `✅ <b>Order Already Paid</b>\n\nOrder <code>${orderId}</code> has already been completed successfully. Your credentials have been delivered.`,
            parse_mode: "HTML"
          });
          return;
        }

        if (details.status !== "WAITING_PAYMENT") {
          await telegramApi("sendMessage", {
            chat_id: chatId,
            text: `⚠️ <b>Invalid Order Status</b>\n\nThis order has status <b>${details.status}</b> and cannot be paid.`,
            parse_mode: "HTML"
          });
          return;
        }

        // Calculate stars required
        const starsAmount = Math.round(Number(details.total) * 77);
        console.log(`[Bot] Sending Stars invoice for order ${orderId}: Amount=${starsAmount} Stars`);

        // Send Star Invoice
        const invoiceRes = await telegramApi("sendInvoice", {
          chat_id: chatId,
          title: `Order ${orderId}`,
          description: `Payment for digital products: ${details.itemsDescription || "Marketplace Items"}`,
          payload: orderId, // Store orderId in invoice payload to parse it on success
          provider_token: "", // MUST be empty for Telegram Stars
          currency: "XTR", // Telegram Stars currency
          prices: [{ label: "Items Total", amount: starsAmount }]
        });

        if (!invoiceRes.ok) {
          console.error(`[Bot] Failed to send Stars invoice:`, invoiceRes.description);
          await telegramApi("sendMessage", {
            chat_id: chatId,
            text: `❌ <b>Failed to generate payment invoice</b>\n\nTelegram returned error: <i>${invoiceRes.description}</i>. Please try again or contact support.`,
            parse_mode: "HTML"
          });
        }
        return;
      }

      // Standard /start without order ID
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: `👋 <b>Welcome to Falcon Logs Payments Bot!</b>\n\nThis bot processes secure payments for Falcon Logs using Telegram Stars (purchasable via Apple Pay or Google Pay).\n\n🛒 To buy accounts or cards, please add them to your cart on <b>Falcon Logs</b> and choose Apple Pay & GPay at checkout.`,
        parse_mode: "HTML"
      });
      return;
    }
  }

  // 2. Handle pre_checkout_query (Telegram requires an answer within 10 seconds to authorize the payment)
  if (update.pre_checkout_query) {
    const queryId = update.pre_checkout_query.id;
    console.log(`[Bot] Received pre-checkout query: ${queryId}`);
    
    // Automatically authorize checkout
    const answer = await telegramApi("answerPreCheckoutQuery", {
      pre_checkout_query_id: queryId,
      ok: true
    });
    
    if (!answer.ok) {
      console.error(`[Bot] Failed to answer pre-checkout query:`, answer.description);
    }
    return;
  }

  // 3. Handle successful payment event
  if (update.message && update.message.successful_payment) {
    const chatId = update.message.chat.id;
    const payment = update.message.successful_payment;
    const orderId = payment.invoice_payload; // extract orderId saved in payload
    console.log(`[Bot] Successful payment received! Order=${orderId}, Chat=${chatId}, Total=${payment.total_amount} Stars`);

    // Call storefront backend to finalize database order and retrieve items
    const completeRes = await localApi("/api/orders/complete-stars", "POST", {
      orderId: orderId,
      secret: STARS_SECRET
    });

    if (completeRes.success && completeRes.order) {
      console.log(`[Bot] Order completed in storefront backend. Delivering credentials...`);
      
      const order = completeRes.order;
      let msg = `🎉 <b>Payment Successful!</b>\n\nThank you for your purchase. Your order <code>${orderId}</code> has been completed successfully.\n\n🔑 <b>Your Purchased Credentials:</b>\n\n`;

      order.items.forEach((item, index) => {
        msg += `📦 <b>Item ${index + 1}: ${item.name}</b>\n`;
        msg += `<code>${item.credentials || "Awaiting restock — our team will deliver shortly."}</code>\n\n`;
      });

      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: msg,
        parse_mode: "HTML"
      });
    } else {
      console.error(`[Bot] Error completing order in backend:`, completeRes.error);
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: `⚠️ <b>Payment Received but Delivery Failed</b>\n\nWe successfully received your payment of ${payment.total_amount} Stars, but could not allocate your stock automatically.\n\nOur administrators have been notified. Please message support with your Order ID: <code>${orderId}</code>.`,
        parse_mode: "HTML"
      });
    }
    return;
  }
}

// Long-polling main loop
async function runBot() {
  console.log("Starting Telegram Stars Payments Bot...");
  const state = { offset: 0 };

  // Quick initial offset sync
  try {
    const res = await telegramApi("getUpdates", { offset: -1, limit: 1 });
    if (res && res.ok && res.result.length > 0) {
      state.offset = res.result[0].update_id + 1;
    }
  } catch (err) {
    console.error("Offset sync error:", err.message);
  }

  while (true) {
    try {
      const response = await telegramApi("getUpdates", {
        offset: state.offset,
        timeout: 15,
        allowed_updates: ["message", "pre_checkout_query"]
      });

      if (response && response.ok && Array.isArray(response.result)) {
        for (const update of response.result) {
          try {
            await handleUpdate(update, state);
          } catch (err) {
            console.error("Error handling update:", err);
          }
          if (update.update_id >= state.offset) {
            state.offset = update.update_id + 1;
          }
        }
      } else {
        if (response && response.description) {
          console.error("getUpdates error:", response.description);
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (err) {
      console.error("Bot loop error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

runBot();

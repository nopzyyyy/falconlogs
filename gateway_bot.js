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

const BOT_TOKEN = process.env.GATEWAY_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
const GATEWAY_NAME = process.env.GATEWAY_NAME || "mysteriogateway";

// Authorized admin list
const ADMIN_IDS = [6926823977]; // Replace with actual Admin Telegram IDs, e.g. [123456789]

const dataDir = path.join(__dirname, "data");
const sessionsFile = path.join(dataDir, "gateway_sessions.json");

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load and save state
function loadState() {
  try {
    if (fs.existsSync(sessionsFile)) {
      const content = fs.readFileSync(sessionsFile, "utf8");
      const parsed = JSON.parse(content);
      if (!parsed.channels) parsed.channels = {};
      if (typeof parsed.offset !== "number") parsed.offset = 0;
      if (!parsed.users) parsed.users = {};
      return parsed;
    }
  } catch (err) {
    console.error("Error reading sessions file:", err.message);
  }
  return { offset: 0, channels: {}, users: {} };
}

function saveState(state) {
  try {
    fs.writeFileSync(sessionsFile, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing sessions file:", err.message);
  }
}

// Check if a user is an authorized admin
function isAdmin(chatId) {
  return ADMIN_IDS.includes(Number(chatId)) || ADMIN_IDS.includes(String(chatId));
}

// Generate a random math captcha
function generateCaptcha() {
  const isAddition = Math.random() > 0.5;
  if (isAddition) {
    const a = Math.floor(Math.random() * 12) + 2; // 2 to 13
    const b = Math.floor(Math.random() * 12) + 2; // 2 to 13
    return {
      question: `What is ${a} + ${b}?`,
      answer: a + b
    };
  } else {
    const a = Math.floor(Math.random() * 10) + 11; // 11 to 20
    const b = Math.floor(Math.random() * 9) + 2;   // 2 to 10
    return {
      question: `What is ${a} - ${b}?`,
      answer: a - b
    };
  }
}

// Telegram API request helper (POST JSON)
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

    // Timeout must be larger than long polling timeout (15s + 10s buffer)
    req.setTimeout(25000, () => {
      req.destroy();
      resolve({ ok: false, error: "Timeout" });
    });

    req.write(data);
    req.end();
  });
}

// Returns the inline keyboard markup containing all discovered channels/groups
function getChannelsMarkup(state) {
  const keyboard = [];
  const channels = state.channels || {};
  const ids = Object.keys(channels);

  // Group buttons dynamically in rows of 2
  for (let i = 0; i < ids.length; i += 2) {
    const row = [];
    const id1 = ids[i];
    row.push({ text: channels[id1].title, callback_data: `get_link:${id1}` });
    
    if (i + 1 < ids.length) {
      const id2 = ids[i + 1];
      row.push({ text: channels[id2].title, callback_data: `get_link:${id2}` });
    }
    keyboard.push(row);
  }
  
  return { inline_keyboard: keyboard };
}

// Handle callback queries when users click channel buttons
async function handleCallbackQuery(callbackQuery, state) {
  const chatId = callbackQuery.message.chat.id;
  const queryId = callbackQuery.id;
  const data = callbackQuery.data;

  // Answer the query immediately so the button stops loading
  await telegramApi("answerCallbackQuery", { callback_query_id: queryId });

  // Handle Admin Broadcast button click
  if (data === "admin_broadcast") {
    if (!isAdmin(chatId)) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "⚠️ Unauthorized access."
      });
      return;
    }

    const user = state.users[chatId];
    if (user) {
      user.waiting_broadcast = true;
      saveState(state);
    }

    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "📢 <b>Create Announcement</b>\n\nPlease send the text message you want to broadcast to all users who have started the bot.\n\n• <i>You can use standard HTML formatting (bold, links, etc.).</i>\n• <i>Type <code>/cancel</code> to abort.</i>",
      parse_mode: "HTML"
    });
    return;
  }

  // Handle dynamic invite links
  if (data.startsWith("get_link:")) {
    // Ensure user is verified before serving links
    const user = state.users[chatId];
    if (!user || !user.verified) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "⚠️ Please complete the captcha first to verify you are human."
      });
      return;
    }

    const targetChatId = data.split(":")[1];
    const channel = state.channels[targetChatId];

    if (!channel) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "⚠️ Channel/group configuration not found."
      });
      return;
    }

    // Generate unique private invite link (strictly 1 join limit, expires in 10 minutes)
    const tenMinutesFromNow = Math.floor(Date.now() / 1000) + 600; // 600 seconds = 10 mins
    
    console.log(`Generating invite link for ${channel.title} (${targetChatId})...`);
    const linkRes = await telegramApi("createChatInviteLink", {
      chat_id: targetChatId,
      name: `Single-Use-${chatId}`,
      member_limit: 1,
      expire_date: tenMinutesFromNow
    });

    if (linkRes && linkRes.ok && linkRes.result && linkRes.result.invite_link) {
      const inviteUrl = linkRes.result.invite_link;
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: `🔗 Here is your unique private link to join <b>${channel.title}</b>:\n\n${inviteUrl}\n\n⚠️ <i>This link is valid for <b>1 join only</b> and will expire in <b>10 minutes</b>.</i>`,
        parse_mode: "HTML"
      });
    } else {
      const errorMsg = linkRes ? linkRes.description : "Network error";
      console.error(`Failed to generate invite link for ${channel.title}:`, errorMsg);
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: `❌ Failed to generate invite link for <b>${channel.title}</b>.\n\n<i>Admin note: Ensure the bot is added to the channel/group as an Admin and has the "Add Members" permission.</i>`,
        parse_mode: "HTML"
      });
    }
  }
}

// Broadcast announcement to all users sequentially with rate limiting
async function executeBroadcast(adminChatId, text, state) {
  const userIds = Object.keys(state.users || {});
  
  await telegramApi("sendMessage", {
    chat_id: adminChatId,
    text: `⏳ Starting broadcast to <b>${userIds.length}</b> users...`,
    parse_mode: "HTML"
  });

  let success = 0;
  let failed = 0;

  for (const uid of userIds) {
    const payload = {
      chat_id: uid,
      text: text,
      parse_mode: "HTML"
    };

    const res = await telegramApi("sendMessage", payload);
    if (res && res.ok) {
      success++;
    } else {
      failed++;
    }

    // Rate-limiting delay of 50ms (max 20 messages/sec, well within Telegram's 30/sec limit)
    await new Promise((r) => setTimeout(r, 50));
  }

  // Clear state
  const admin = state.users[adminChatId];
  if (admin) {
    admin.waiting_broadcast = false;
    saveState(state);
  }

  await telegramApi("sendMessage", {
    chat_id: adminChatId,
    text: `📢 <b>Broadcast Completed!</b>\n\n✅ Sent successfully: <b>${success}</b>\n❌ Blocked/Failed: <b>${failed}</b>`,
    parse_mode: "HTML"
  });
}

// Handle regular incoming text messages (captchas & admin commands)
async function handleMessage(message, state) {
  const chatId = message.chat.id;
  const text = message.text.trim();

  // Initialize or load user session
  if (!state.users[chatId]) {
    state.users[chatId] = {
      verified: false,
      captcha: null
    };
  }

  const user = state.users[chatId];

  // 1. Handle Admin Broadcast Message Input State
  if (user.waiting_broadcast) {
    if (text === "/cancel") {
      user.waiting_broadcast = false;
      saveState(state);
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "❌ Broadcast cancelled."
      });
      return;
    }

    // Execute background broadcast
    executeBroadcast(chatId, text, state).catch(err => {
      console.error("Error executing broadcast:", err);
    });
    return;
  }

  // 2. Handle Admin Dashboard Command
  if (text.startsWith("/admin")) {
    if (!isAdmin(chatId)) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "⚠️ You are not authorized to access the admin panel."
      });
      return;
    }

    const totalUsers = Object.keys(state.users || {}).length;
    const verifiedUsers = Object.values(state.users || {}).filter(u => u.verified).length;
    const channelsCount = Object.keys(state.channels || {}).length;

    let channelsList = "";
    if (channelsCount > 0) {
      channelsList = "\n\n<b>Registered Chats:</b>\n" + Object.entries(state.channels).map(([id, ch]) => `• ${ch.title} (<code>${id}</code>)`).join("\n");
    }

    const report = `📊 <b>Admin Dashboard</b>\n\n• Total Users: <b>${totalUsers}</b>\n• Verified Users: <b>${verifiedUsers}</b>\n• Discovered Chats: <b>${channelsCount}</b>${channelsList}`;

    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: report,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Create Announcement", callback_data: "admin_broadcast" }]
        ]
      }
    });
    return;
  }

  // 3. Handle /start command (reset or generate captcha)
  if (text.startsWith("/start")) {
    if (user.verified) {
      const channelsCount = Object.keys(state.channels || {}).length;
      if (channelsCount === 0) {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: `Welcome back to <b>${GATEWAY_NAME}</b>.\n\n⚠️ <i>No channels or groups have been discovered by the bot yet. Admin, please post a test message in each channel and group so the bot registers them!</i>`,
          parse_mode: "HTML"
        });
      } else {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: `Welcome back to <b>${GATEWAY_NAME}</b>. Select a channel or group below to get your unique join link:`,
          parse_mode: "HTML",
          reply_markup: getChannelsMarkup(state)
        });
      }
      return;
    }

    const captcha = generateCaptcha();
    user.verified = false;
    user.captcha = captcha;
    saveState(state);

    const welcomeMsg = `Welcome to <b>${GATEWAY_NAME}</b>! 🎉\n\nTo access our channels/groups, please solve this simple captcha first:\n\n<b>${captcha.question}</b>`;
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: welcomeMsg,
      parse_mode: "HTML"
    });
    return;
  }

  // 4. Handle already-verified users (show buttons)
  if (user.verified) {
    const channelsCount = Object.keys(state.channels || {}).length;
    if (channelsCount === 0) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: `Welcome back to <b>${GATEWAY_NAME}</b>.\n\n⚠️ <i>No channels or groups have been discovered by the bot yet. Admin, please post a test message in each channel and group so the bot registers them!</i>`,
        parse_mode: "HTML"
      });
    } else {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: `Welcome back to <b>${GATEWAY_NAME}</b>. Select a channel or group below to get your unique join link:`,
        parse_mode: "HTML",
        reply_markup: getChannelsMarkup(state)
      });
    }
    return;
  }

  // 5. Handle captcha answer submission
  if (user.captcha) {
    const parsedAns = parseInt(text, 10);
    if (!isNaN(parsedAns) && parsedAns === user.captcha.answer) {
      user.verified = true;
      user.captcha = null;
      saveState(state);

      const channelsCount = Object.keys(state.channels || {}).length;
      if (channelsCount === 0) {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: `✅ <b>Correct!</b> Verification successful.\n\nWelcome to <b>${GATEWAY_NAME}</b>.\n\n⚠️ <i>No channels or groups have been discovered by the bot yet. Admin, please post a test message in each channel and group so the bot registers them!</i>`,
          parse_mode: "HTML"
        });
      } else {
        await telegramApi("sendMessage", {
          chat_id: chatId,
          text: `✅ <b>Correct!</b> Verification successful.\n\nWelcome to <b>${GATEWAY_NAME}</b>. Select a channel or group below to join:`,
          parse_mode: "HTML",
          reply_markup: getChannelsMarkup(state)
        });
      }
    } else {
      // Wrong answer, generate a new captcha
      const newCaptcha = generateCaptcha();
      user.captcha = newCaptcha;
      saveState(state);

      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: `❌ <b>Incorrect answer.</b> Let's try another one:\n\n<b>${newCaptcha.question}</b>`,
        parse_mode: "HTML"
      });
    }
  } else {
    // No active captcha, generate one
    const captcha = generateCaptcha();
    user.verified = false;
    user.captcha = captcha;
    saveState(state);

    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: `Welcome to <b>${GATEWAY_NAME}</b>! 🎉\n\nPlease solve this simple captcha first:\n\n<b>${captcha.question}</b>`,
      parse_mode: "HTML"
    });
  }
}

// Routes incoming updates based on type
async function handleUpdate(update, state) {
  // 1. Handle bot added/removed from channel or group
  if (update.my_chat_member && update.my_chat_member.chat) {
    const chat = update.my_chat_member.chat;
    const type = chat.type;
    
    if (type === "channel" || type === "group" || type === "supergroup") {
      const status = (update.my_chat_member.new_chat_member || {}).status || "";
      const id = String(chat.id);
      
      if (!state.channels) state.channels = {};
      
      if (status === "left" || status === "kicked") {
        if (state.channels[id]) {
          console.log(`Removed from ${type}: ${chat.title} (${id})`);
          delete state.channels[id];
          saveState(state);
        }
      } else {
        console.log(`Discovered ${type} via my_chat_member: ${chat.title} (${id})`);
        state.channels[id] = { title: chat.title || "Chat" };
        saveState(state);
      }
    }
    return;
  }

  // 2. Handle message posted in a channel the bot is in
  if (update.channel_post && update.channel_post.chat && update.channel_post.chat.type === "channel") {
    const chat = update.channel_post.chat;
    const id = String(chat.id);
    
    if (!state.channels) state.channels = {};
    if (!state.channels[id]) {
      console.log(`Discovered channel via channel_post: ${chat.title} (${id})`);
      state.channels[id] = { title: chat.title || "Channel" };
      saveState(state);
    }
    return;
  }

  // 3. Handle message posted in a group or supergroup the bot is in
  if (update.message && update.message.chat) {
    const chat = update.message.chat;
    const type = chat.type;
    
    if (type === "group" || type === "supergroup") {
      const id = String(chat.id);
      if (!state.channels) state.channels = {};
      if (!state.channels[id]) {
        console.log(`Discovered ${type} via message: ${chat.title} (${id})`);
        state.channels[id] = { title: chat.title || "Group" };
        saveState(state);
      }
      return; // Stop processing further since we only wanted to register the group ID
    }
  }

  // 4. Handle callback query button clicks
  if (update.callback_query && update.callback_query.message && update.callback_query.message.chat) {
    try {
      await handleCallbackQuery(update.callback_query, state);
    } catch (err) {
      console.error("Error handling callback query:", err);
    }
    return;
  }

  // 5. Handle private text messages
  if (update.message && update.message.chat && update.message.chat.type === "private") {
    if (typeof update.message.text !== "string") return;
    try {
      await handleMessage(update.message, state);
    } catch (err) {
      console.error("Error handling message:", err);
    }
    return;
  }
}

// Self-healing offset alignment on startup
async function alignOffset(state) {
  console.log("Aligning offset with Telegram...");
  const response = await telegramApi("getUpdates", {
    offset: -1,
    limit: 1
  });
  if (response && response.ok && Array.isArray(response.result) && response.result.length > 0) {
    const latestId = response.result[0].update_id;
    if (Math.abs(state.offset - latestId) > 5000) {
      console.log(`[Offset Correction] Stored offset ${state.offset} was out of sync with Telegram update ID ${latestId}. Aligning state.offset to ${latestId}.`);
      state.offset = latestId;
      saveState(state);
    }
  }
}

// Long-polling loop
async function runBot() {
  console.log(`Starting Telegram Gateway Bot for ${GATEWAY_NAME}...`);
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
        timeout: 15, // 15 seconds long-poll timeout
        allowed_updates: ["message", "callback_query", "channel_post", "my_chat_member"] // Listen to all necessary events
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
            saveState(state);
          }
        }
      } else {
        if (response && response.description) {
          console.error("getUpdates returned error:", response.description);
        }
        // Brief sleep on error to avoid spamming requests
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (err) {
      console.error("Error in main bot loop:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

runBot();

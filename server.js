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
        process.env[k] = v;
      }
    }
  }
} catch (e) {
  // Silent fallback if .env not present
}
// -----------------------------------

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const root = __dirname;
const dataDir = path.join(root, "data");
const uploadsDir = path.join(root, "uploads");
const screenshotsDir = path.join(root, "screenshots");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

const dataFile = path.join(dataDir, "inventory.json");
const binCacheFile = path.join(dataDir, "bin-cache.json");

// System account credentials (server.js is never served publicly — see static allowlist)
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || "admin@falconlogs.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123456!";
const GOD_EMAIL      = process.env.GOD_EMAIL || "god@falconlogs.com";
const GOD_PASSWORD   = process.env.GOD_PASSWORD || "Admin123456!";


// =========================================================================
// BIN LOOKUP — uses handyapi.com to enrich card metadata from the first 6 digits
// =========================================================================
const HANDYAPI_KEY = process.env.HANDYAPI_KEY || "";
const binMemoryCache = new Map();
let binCacheLoaded = false;

function loadBinCache() {
  if (binCacheLoaded) return;
  binCacheLoaded = true;
  try {
    if (fs.existsSync(binCacheFile)) {
      const cached = JSON.parse(fs.readFileSync(binCacheFile, "utf8") || "{}");
      Object.entries(cached).forEach(([k, v]) => binMemoryCache.set(k, v));
    }
  } catch {}
}

function saveBinCache() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const obj = {};
    binMemoryCache.forEach((v, k) => { obj[k] = v; });
    fs.writeFileSync(binCacheFile, JSON.stringify(obj, null, 2));
  } catch {}
}

// Look up a 6-digit BIN. Returns { scheme, type, tier, issuer, country, countryName } or null.
// Result is cached on disk so the same BIN never hits the API twice.
function lookupBin(bin6) {
  loadBinCache();
  if (binMemoryCache.has(bin6)) return Promise.resolve(binMemoryCache.get(bin6));

  return new Promise((resolve) => {
    const options = {
      hostname: "data.handyapi.com",
      port: 443,
      path: `/bin/${encodeURIComponent(bin6)}`,
      method: "GET",
      headers: { "x-api-key": HANDYAPI_KEY }
    };
    const httpsLib = require("https");
    const req = httpsLib.request(options, (resp) => {
      let body = "";
      resp.on("data", chunk => body += chunk);
      resp.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (json && json.Status === "SUCCESS") {
            const info = {
              scheme: json.Scheme || null,
              type: json.Type || null,
              tier: json.CardTier || null,
              issuer: json.Issuer || null,
              country: (json.Country && (json.Country.A3 || json.Country.A2)) || null,
              countryName: (json.Country && json.Country.Name) || null
            };
            binMemoryCache.set(bin6, info);
            saveBinCache();
            resolve(info);
          } else {
            // Cache the miss too so we don't retry forever for an unknown BIN
            binMemoryCache.set(bin6, null);
            saveBinCache();
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}
// Telegram & Bot tokens
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_ADMIN_IDS = (process.env.TELEGRAM_ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
const TELEGRAM_RESTOCK_BOT_TOKEN = process.env.TELEGRAM_RESTOCK_BOT_TOKEN || "";
const DASHBOARD_BOT_TOKEN = process.env.DASHBOARD_BOT_TOKEN || "";
const STARS_SECRET = process.env.STARS_SECRET || "MysterioStarsSecret2026";
const NOWPAYMENTS_TOPUP_API_KEY = process.env.NOWPAYMENTS_TOPUP_API_KEY || "57A2JR9-1WK4G4V-MZZEX3B-N3T5FH9";
const NOWPAYMENTS_ORDER_API_KEY = process.env.NOWPAYMENTS_ORDER_API_KEY || "FN9YNAF-DZX4N7B-KRT4ZCV-JYSGGAT";
const NOWPAYMENTS_IPN_SECRET    = process.env.NOWPAYMENTS_IPN_SECRET || "YYKKTZ0fGAgebjKwbhvw4iGaFCd401oc";
const NOWPAYMENTS_URL           = process.env.NOWPAYMENTS_URL || "https://api.nowpayments.io/v1";
const PUBLIC_BASE_URL           = process.env.PUBLIC_BASE_URL || "https://mysterio.cc";

const refundsFile = path.join(dataDir, "refunds.json");
const LOG_PRODUCT_REFUND_WINDOW_HOURS = 24;
const CRYPTO_DIRECT_DISCOUNT = 0.00;  // Full amount expected (no 10% discount)
const TOPUP_BONUS_PCT = 0.10;          // 10% bonus credits when topping up via crypto
const PAYMENT_EXPIRY_MS = 20 * 60 * 1000; // crypto invoices expire after 20 minutes; reserved stock is then released

const productsFile = path.join(dataDir, "products.json");
const categoriesFile = path.join(dataDir, "categories.json");
const settingsFile = path.join(dataDir, "settings.json");
const couponsFile = path.join(dataDir, "coupons.json");
const announcementsFile = path.join(dataDir, "announcements.json");
const faqFile = path.join(dataDir, "faq.json");
const pagesFile = path.join(dataDir, "pages.json");
const auditLogsFile = path.join(dataDir, "audit_logs.json");
const lockdownFile = path.join(dataDir, "lockdown.json");
const LOCKDOWN_PASSWORD = process.env.LOCKDOWN_PASSWORD || "";

function isSiteLocked() {
  try {
    if (fs.existsSync(lockdownFile)) {
      const data = JSON.parse(fs.readFileSync(lockdownFile, "utf8"));
      return Boolean(data && data.locked);
    }
  } catch {}
  return false;
}

function setSiteLock(locked, reason = "LOCKED BY OWNER") {
  try {
    fs.writeFileSync(lockdownFile, JSON.stringify({
      locked: Boolean(locked),
      lockedAt: locked ? new Date().toISOString() : null,
      reason: reason || "LOCKED BY OWNER"
    }, null, 2));
    return true;
  } catch {
    return false;
  }
}

function renderLockdownHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Mysterio — Unavailable</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #060608;
      color: #f1f1f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 40px 20px 24px;
      user-select: none;
      position: relative;
      overflow: hidden;
    }
    .grid-glow {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(239, 68, 68, 0.08) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .lock-container {
      margin: auto;
      text-align: center;
      max-width: 480px;
      z-index: 1;
      animation: fadeIn 0.4s ease-out;
    }
    .lock-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 18px;
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #ef4444;
      margin-bottom: 24px;
      box-shadow: 0 8px 32px rgba(239, 68, 68, 0.12);
    }
    .lock-title {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffffff;
      margin-bottom: 12px;
      text-shadow: 0 2px 20px rgba(0,0,0,0.5);
    }
    .lock-sub {
      font-size: 14px;
      color: #71717a;
      line-height: 1.6;
      margin-bottom: 0;
      letter-spacing: 0.02em;
    }
    .unlock-footer {
      z-index: 1;
      width: 100%;
      max-width: 320px;
      text-align: center;
    }
    .unlock-trigger {
      background: transparent;
      border: none;
      color: #27272a;
      font-size: 10px;
      letter-spacing: 0.05em;
      cursor: pointer;
      padding: 6px 12px;
      transition: color 0.3s;
      outline: none;
    }
    .unlock-trigger:hover {
      color: #52525b;
    }
    .unlock-box {
      display: none;
      margin-top: 10px;
      animation: fadeIn 0.2s ease-out;
    }
    .unlock-input-wrap {
      display: flex;
      gap: 6px;
      background: #0f0f13;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 4px;
    }
    .unlock-input {
      flex: 1;
      background: transparent;
      border: none;
      color: #f1f1f5;
      font-size: 11px;
      font-family: monospace;
      padding: 6px 10px;
      outline: none;
    }
    .unlock-btn {
      background: #ef4444;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 0 12px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    }
    .unlock-btn:hover {
      background: #dc2626;
    }
    .unlock-err {
      color: #ef4444;
      font-size: 10.5px;
      margin-top: 6px;
      display: none;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <div class="grid-glow"></div>
  <div style="height: 1px;"></div>
  <div class="lock-container">
    <div class="lock-badge">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
    </div>
    <h1 class="lock-title">LOCKED BY OWNER</h1>
    <p class="lock-sub">This platform is currently unavailable.</p>
  </div>
  <div class="unlock-footer">
    <button class="unlock-trigger" id="unlockTrigger" onclick="document.getElementById('unlockBox').style.display='block'; this.style.display='none'; document.getElementById('unlockInput').focus();">enter password to unlock</button>
    <div class="unlock-box" id="unlockBox">
      <div class="unlock-input-wrap">
        <input type="password" class="unlock-input" id="unlockInput" placeholder="Master Password..." autocomplete="off">
        <button class="unlock-btn" id="unlockBtn" onclick="submitUnlock()">Unlock</button>
      </div>
      <div class="unlock-err" id="unlockErr">Invalid master password.</div>
    </div>
  </div>
  <script>
    async function submitUnlock() {
      const pwd = document.getElementById('unlockInput').value;
      const err = document.getElementById('unlockErr');
      const btn = document.getElementById('unlockBtn');
      if (!pwd) return;
      btn.disabled = true;
      btn.textContent = '...';
      err.style.display = 'none';
      try {
        const res = await fetch('/api/lockdown/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          window.location.href = '/';
        } else {
          err.textContent = data.error || 'Invalid master password.';
          err.style.display = 'block';
        }
      } catch (e) {
        err.textContent = 'Connection error.';
        err.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Unlock';
      }
    }
    document.getElementById('unlockInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') submitUnlock();
    });
  </script>
</body>
</html>`;
}

function readSettings() {
  const defaultSettings = {
    paymentMethods: {
      balance: true,
      crypto: true,
      chime: true,
      tg_stars: true
    },
    telegramForwarder: {
      enabled: false,
      intervalHours: 6,
      sourceMessageLink: "https://t.me/Flowmark/1287"
    },
    particlesEnabled: true
  };
  const settings = readJson(settingsFile, defaultSettings);
  if (settings.particlesEnabled === undefined) {
    settings.particlesEnabled = true;
  }
  return settings;
}

function writeSettings(settings) {
  writeJson(settingsFile, settings);
}

function readProducts() {
  ensureData();
  return readJson(productsFile, []);
}

function writeProducts(items) {
  ensureData();
  writeJson(productsFile, items);
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const cityByState = {
  FL: "Miami",
  GA: "Atlanta",
  IL: "Chicago",
  MO: "Kansas City",
  NC: "Raleigh",
  NJ: "Newark",
  NM: "Santa Fe",
  NY: "New York",
  OH: "Columbus",
  OR: "Portland",
  TN: "Nashville",
  TX: "Dallas"
};

function toItem(row) {
  return {
    id: crypto.randomUUID(),
    bin: String(row[0] || "").trim(),
    type: String(row[1] || "").trim().toUpperCase(),
    level: String(row[2] || "").trim().toUpperCase(),
    issuer: String(row[3] || "").trim(),
    state: String(row[4] || "").trim().toUpperCase(),
    zip: String(row[5] || "").trim(),
    country: String(row[6] || "").trim().toUpperCase(),
    base: String(row[7] || "").trim(),
    billing: String(row[8] || "Y").trim().toUpperCase(),
    price: Number.parseFloat(String(row[9] || "2.00").replace(/[^0-9.]/g, "")) || 2,
    city: String(row[10] || "").trim(),
    isSold: false,
    soldTo: null,
    orderId: null
  };
}

const seedItems = [
  ["483312", "DEBIT", "CLASSIC", "JPMORGAN CHASE BANK N.A. - TEST", "NM", "88346", "USA", "05/24 USA TOP SELLER", "Y", "2.00", "Alamogordo"],
  ["473702", "DEBIT", "CLASSIC", "WELLS FARGO BANK, NATIONAL ASSOCIATION - TEST", "NC", "27529", "USA", "05/24 USA TOP SELLER", "Y", "2.00", "Garner"],
  ["601100", "CREDIT", "PLATINUM", "DISCOVER ISSUER - TEST", "IL", "62922", "USA", "0525-US-SNIFFED-85% (£500 DEMO BALANCE)", "Y", "17.50", "Carbondale"],
  ["426684", "CREDIT", "TRADITIONAL", "JPMORGAN CHASE BANK N.A. - TEST", "NY", "10033", "USA", "05/24 USA TOP SELLER", "Y", "2.00", "New York"],
  ["498503", "DEBIT", "CLASSIC", "STRIDE BANK, NATIONAL ASSOCIATION - TEST", "FL", "33596", "USA", "05/24 USA TOP SELLER", "Y", "2.00", "Valrico"],
  ["433419", "CREDIT", "TRADITIONAL", "VARO BANK, NATIONAL ASSOCIATION - TEST", "TX", "77506", "USA", "05/24 USA TOP SELLER", "Y", "2.00", "Pasadena"],
  ["444796", "CREDIT", "TRADITIONAL", "CREDIT ONE BANK, NATIONAL ASSOCIATION - TEST", "OR", "97526", "USA", "05/24 USA TOP SELLER", "Y", "2.00", "Grants Pass"],
  ["482812", "CREDIT", "SIGNATURE", "THE BANCORP BANK, NATIONAL ASSOCIATION - TEST", "TN", "37334", "USA", "05/24 USA TOP SELLER", "Y", "2.00", "Fayetteville"]
].map(toItem);

function toFullzItem(row, baseMeta = {}) {
  const pan = String(row[0] || "").trim();
  return {
    id: crypto.randomUUID(),
    bin: pan.slice(0, 6),
    pan,
    mm: String(row[1] || "").trim(),
    yy: String(row[2] || "").trim(),
    cvv: String(row[3] || "").trim(),
    name: String(row[4] || "").trim(),
    address: String(row[5] || "").trim(),
    phone: String(row[9] || "").trim(),
    email: String(row[10] || "").trim(),
    city: String(row[6] || "").trim(),
    state: String(row[7] || "").trim().toUpperCase(),
    zip: String(row[8] || "").trim(),
    base: String(baseMeta.base || "").trim() || "—",
    price: Number.parseFloat(String(baseMeta.price || "2.00").replace(/[^0-9.]/g, "")) || 2,
    type: String(baseMeta.type || "CREDIT").trim().toUpperCase(),
    level: String(baseMeta.level || "CLASSIC").trim().toUpperCase(),
    country: String(baseMeta.country || "USA").trim().toUpperCase(),
    issuer: String(baseMeta.issuer || "—").trim(),
    refundable: baseMeta.refundable !== false,
    refundWindowHours: Number(baseMeta.refundWindowHours) > 0 ? Number(baseMeta.refundWindowHours) : 24,
    billing: baseMeta.refundable === false ? "N" : "Y",
    isSold: false,
    soldTo: null,
    orderId: null
  };
}

function normalizeItem(item) {
  return {
    ...item,
    city: item.city || cityByState[item.state] || "Metro",
    isSold: item.isSold || false,
    soldTo: item.soldTo || null,
    orderId: item.orderId || null
  };
}

function publicItemView(item) {
  const rawBin = String(item.bin || "");
  const first6 = rawBin.slice(0, 6);
  return {
    id: item.id,
    bin: first6,
    type: item.type,
    level: item.level,
    issuer: item.issuer,
    state: item.state,
    zip: item.zip,
    country: item.country,
    base: item.base,
    billing: item.billing,
    refundable: typeof item.refundable === "boolean" ? item.refundable : (item.billing !== "N"),
    refundWindowHours: Number(item.refundWindowHours) > 0 ? Number(item.refundWindowHours) : 24,
    price: item.price,
    city: item.city,
    scheme: item.scheme || null,
    isSold: item.isSold
  };
}

function buildDeliveredCredentials(stockEntry) {
  if (stockEntry.pan) {
    return `${stockEntry.pan}|${stockEntry.mm || ""}|${stockEntry.yy || ""}|${stockEntry.cvv || ""}|${stockEntry.name || ""}|${stockEntry.address || ""}|${stockEntry.city || ""}|${stockEntry.state || ""}|${stockEntry.zip || ""}|${stockEntry.phone || ""}|${stockEntry.email || ""}`;
  }
  return `${stockEntry.bin} | ${stockEntry.type} | ${stockEntry.level} | ${stockEntry.issuer} | ${stockEntry.state} | ${stockEntry.zip} | ${stockEntry.country} | ${stockEntry.base} | ${stockEntry.billing} | ${stockEntry.price} | ${stockEntry.city}`;
}

const usersFile = path.join(dataDir, "users.json");
const sessionsFile = path.join(dataDir, "sessions.json");
const ordersFile = path.join(dataDir, "orders.json");
const topupsFile = path.join(dataDir, "topups.json");
const replacementsFile = path.join(dataDir, "replacements.json");

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) return false;
  const typedHash = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), typedHash);
}

function ensureData() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(seedItems, null, 2));
  }
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([
      {
        id: crypto.randomUUID(),
        email: ADMIN_EMAIL,
        passwordHash: hashPassword(ADMIN_PASSWORD),
        role: "ADMIN",
        balance: 0,
        createdAt: new Date().toISOString()
      }
    ], null, 2));
  }
  if (!fs.existsSync(sessionsFile)) {
    fs.writeFileSync(sessionsFile, "[]");
  }
  if (!fs.existsSync(ordersFile)) {
    fs.writeFileSync(ordersFile, "[]");
  }
  if (!fs.existsSync(refundsFile)) {
    fs.writeFileSync(refundsFile, "[]");
  }
  if (!fs.existsSync(topupsFile)) {
    fs.writeFileSync(topupsFile, "[]");
  }
  if (!fs.existsSync(categoriesFile)) {
    fs.writeFileSync(categoriesFile, "[]");
  }
  if (!fs.existsSync(productsFile)) {
    const seedProducts = [
      { id: "server-access", title: "Server Access Logs", category: "Server", stock: 48, price: "1.00", code: "ACCESS", variants: 10, tags: "server, sample", isHidden: false },
      { id: "auth-events", title: "Auth Event Samples", category: "Auth", stock: 36, price: "1.50", code: "AUTH", variants: 7, tags: "auth, sample", isHidden: false },
      { id: "traffic-pack", title: "Traffic Log Pack", category: "Traffic", stock: 215, price: "1.00", code: "TRAFFIC", variants: 14, tags: "traffic, demo", isHidden: false },
      { id: "app-errors", title: "Application Error Logs", category: "App", stock: 64, price: "2.00", code: "ERRORS", variants: 8, tags: "application, debug", isHidden: false },
      { id: "security-audit", title: "Security Audit Samples", category: "Security", stock: 29, price: "2.50", code: "AUDIT", variants: 5, tags: "audit, security", isHidden: false },
      { id: "api-requests", title: "API Request Logs", category: "Server", stock: 84, price: "1.25", code: "API", variants: 6, tags: "api, requests", isHidden: false },
      { id: "workflow-debug", title: "Workflow Debug Logs", category: "App", stock: 51, price: "1.75", code: "DEBUG", variants: 4, tags: "workflow, debug", isHidden: false },
      { id: "archive-bundle", title: "Archive Log Bundle", category: "Archive", stock: 18, price: "3.00", code: "ARCHIVE", variants: 3, tags: "archive, bundle", isHidden: false }
    ];
    fs.writeFileSync(productsFile, JSON.stringify(seedProducts, null, 2));
  }
  if (!fs.existsSync(couponsFile)) {
    fs.writeFileSync(couponsFile, "[]");
  }
  if (!fs.existsSync(announcementsFile)) {
    fs.writeFileSync(announcementsFile, "[]");
  }
  if (!fs.existsSync(auditLogsFile)) {
    fs.writeFileSync(auditLogsFile, "[]");
  }
  if (!fs.existsSync(faqFile)) {
    const defaultFaqs = [
      {
        id: "faq-1",
        question: "How does digital checkout work?",
        answer: "Add products or card inventory to your cart, select your payment method (Balance, Crypto, Chime, or Telegram Stars), and check out. Items are delivered instantly.",
        order: 1,
        isActive: true
      },
      {
        id: "faq-2",
        question: "What is the refund policy?",
        answer: "We offer a 24-hour refund window for invalid credentials. You can raise a support ticket or request a refund from your completed orders page.",
        order: 2,
        isActive: true
      }
    ];
    fs.writeFileSync(faqFile, JSON.stringify(defaultFaqs, null, 2));
  }
  if (!fs.existsSync(pagesFile)) {
    const defaultPages = {
      tos: {
        title: "Terms of Service",
        content: "Welcome to Mysterio.cc. By purchasing from our store, you agree to our terms. All transactions are final unless subject to our 24-hour replacement/refund window. We do not tolerate abuse or fraudulent disputes. Keep your account secure as you are responsible for all activity on it.",
        updatedAt: new Date().toISOString()
      },
      privacy: {
        title: "Privacy Policy",
        content: "We only collect minimal information (email) necessary to manage your account and deliver purchases. We use secure cookies to keep you logged in. We do not sell or share your data with any third parties. All credentials and payment details are handled via secure channels.",
        updatedAt: new Date().toISOString()
      }
    };
    fs.writeFileSync(pagesFile, JSON.stringify(defaultPages, null, 2));
  }
}

function logAuditAction(req, action, details) {
  try {
    const session = getSession(req);
    const userId = session ? session.user.id : "system";
    const userEmail = session ? session.user.email : "system";
    const ipAddress = (req && req.socket) ? (req.socket.remoteAddress || "127.0.0.1") : "127.0.0.1";
    const logs = readJson(auditLogsFile, []);
    const entry = {
      id: "AUD-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
      userId,
      userEmail,
      action,
      details,
      ipAddress,
      createdAt: new Date().toISOString()
    };
    logs.unshift(entry);
    if (logs.length > 500) logs.splice(500);
    writeJson(auditLogsFile, logs);
  } catch (err) {
    console.error("[audit] log error:", err.message);
  }
}

function onOrderCompleted(order) {
  if (order.couponCode) {
    const coupons = readJson(couponsFile, []);
    const coupon = coupons.find(c => c.code.toUpperCase() === order.couponCode.toUpperCase());
    if (coupon) {
      coupon.usedCount = (coupon.usedCount || 0) + 1;
      writeJson(couponsFile, coupons);
    }
  }
  try {
    let itemsText = "";
    (order.items || []).forEach(item => {
      itemsText += `<b>${item.name}</b>\n<code>${item.credentials || "Pending delivery"}</code>\n\n`;
    });
    const msg = `<b>Order Completed!</b>\n` +
      `Order ID: <code>${order.id}</code>\n` +
      `Amount paid: <b>£${Number(order.total || 0).toFixed(2)}</b>\n` +
      `Payment method: <b>${order.paymentMethod}</b>\n\n` +
      `<b>Your Credentials/Assets:</b>\n${itemsText}`;
    notifyUserDashboard(order.userId, msg);
  } catch (err) {
    console.error("Error sending Telegram order completion notification:", err.message);
  }
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) return false;
  const typedHash = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), typedHash);
}

function readJson(file, fallback) {
  ensureData();
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureData();
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function readItems() {
  ensureData();
  return JSON.parse(fs.readFileSync(dataFile, "utf8")).map(normalizeItem);
}

function writeItems(items) {
  ensureData();
  fs.writeFileSync(dataFile, JSON.stringify(items, null, 2));
}

const SUCCESS_BOT_TOKEN = "8809385026:AAGHDJbzgNHMfkUDV6LZecagd4zD4487RYM";

function sendCustomOrderTelegramNotification(order) {
  let message = `🔔 <b>New Custom Order Paid!</b>\n\n`;
  message += `Order ID: <code>${order.id}</code>\n`;
  message += `Total Paid: <b>£${Number(order.total || 0).toFixed(2)}</b>\n`;
  message += `Payment Method: <b>${order.paymentMethod}</b>\n`;
  message += `Customer ID: <code>${order.userId}</code>\n\n`;
  message += `<b>Requested Items:</b>\n`;

  (order.items || []).forEach((item, idx) => {
    if (item.type === "custom-product") {
      message += `\n📦 <b>Item #${idx + 1}: ${item.name}</b>\n`;
      const inputs = item.customInputs || {};
      if (inputs.email) message += `📧 <i>Email</i>: <code>${inputs.email}</code>\n`;
      if (inputs.password) message += `🔑 <i>Password</i>: <code>${inputs.password}</code>\n`;
      if (inputs.description) message += `📝 <i>Details</i>: <code>${inputs.description}</code>\n`;
    }
  });

  message += `\n💡 <b>How to deliver this order:</b>\n`;
  message += `• To deliver with details (e.g. email:pass or link):\n`;
  message += `  <code>/complete ${order.id} &lt;details&gt;</code>\n`;
  message += `• To mark completed with default template:\n`;
  message += `  <code>/done ${order.id}</code>\n`;

  const payload = {
    chat_id: 6926823977,
    text: message,
    parse_mode: "HTML"
  };

  const postData = JSON.stringify(payload);
  const options = {
    hostname: "api.telegram.org",
    port: 443,
    path: `/bot${DASHBOARD_BOT_TOKEN}/sendMessage`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let body = "";
    res.on("data", (chunk) => body += chunk);
    res.on("end", () => {
      console.log(`[Success Bot Notify] Result:`, body);
    });
  });

  req.on("error", (err) => {
    console.error(`[Success Bot Notify] Error:`, err.message);
  });

  req.write(postData);
  req.end();
}

function completeProductOrderInternal(orderId) {
  const orders = readJson(ordersFile, []);
  const order = orders.find(o => o.id === orderId);
  if (!order) return null;
  if (order.status === "COMPLETED" || order.status === "PROCESSING") return order;

  const allInventory = readItems();
  const allProducts = readProducts();
  const deliveredItems = [];
  let pendingFulfillment = false;
  let hasCustomItems = false;

  for (const item of order.items) {
    if (item.type === "stock") {
      const stockEntry = allInventory.find(inv => inv.id === item.id && (inv.orderId === order.id || !inv.isSold));
      if (stockEntry) {
        stockEntry.isSold = true;
        stockEntry.soldTo = order.userId;
        stockEntry.orderId = order.id;
        deliveredItems.push({
          id: stockEntry.id,
          type: "stock",
          name: `${stockEntry.bin} ${stockEntry.type} ${stockEntry.level}`,
          price: stockEntry.price,
          refundable: stockEntry.refundable !== false,
          refundWindowHours: Number(stockEntry.refundWindowHours) > 0 ? Number(stockEntry.refundWindowHours) : 24,
          credentials: buildDeliveredCredentials(stockEntry)
        });
      }
    } else if (item.type === "custom-product") {
      hasCustomItems = true;
      deliveredItems.push(item);
      
      const parts = String(item.id).split(":");
      if (parts.length > 1) {
        const prod = allProducts.find(p => p.id === parts[0]);
        if (prod && (prod.isCustom || prod.isManualDelivery)) {
          const variant = Array.isArray(prod.variants) ? prod.variants.find(v => v.id === parts[1]) : null;
          if (variant && prod.unlimitedStock === false) {
            const qty = Math.max(1, Number(item.quantity || 1));
            variant.manualStock = Math.max(0, (typeof variant.manualStock === "number" ? variant.manualStock : 0) - qty);
          }
        }
      }
    } else {
      const parts = String(item.id).split(":");
      const prod = allProducts.find(p => p.id === parts[0]);
      if (prod && prod.isManualDelivery) {
        hasCustomItems = true;
        item.type = "custom-product";
        item.credentials = "Awaiting manual delivery by administrator.";
        deliveredItems.push(item);
        
        const variant = Array.isArray(prod.variants) ? prod.variants.find(v => v.id === parts[1]) : null;
        if (variant && prod.unlimitedStock === false) {
          const qty = Math.max(1, Number(item.quantity || 1));
          variant.manualStock = Math.max(0, (typeof variant.manualStock === "number" ? variant.manualStock : 0) - qty);
        }
      } else {
        const allocated = allocateProductStock(item, order.userId, order.id);
        if (allocated) {
          deliveredItems.push({
            id: item.id,
            type: "log-product",
            name: allocated.name,
            price: allocated.price,
            refundable: true,
            refundWindowHours: LOG_PRODUCT_REFUND_WINDOW_HOURS,
            credentials: allocated.credentials
          });
        } else {
          pendingFulfillment = true;
          deliveredItems.push({
            id: item.id,
            type: "log-product",
            name: item.name,
            price: item.price,
            refundable: true,
            refundWindowHours: LOG_PRODUCT_REFUND_WINDOW_HOURS,
            credentials: "Awaiting restock — our team will deliver your item or refund you shortly. Please contact support with this order ID."
          });
        }
      }
    }
  }

  writeItems(allInventory);
  writeProducts(allProducts);

  order.status = hasCustomItems ? "PROCESSING" : "COMPLETED";
  order.items = deliveredItems;
  if (pendingFulfillment) order.fulfillmentPending = true;
  writeJson(ordersFile, orders);

  if (hasCustomItems) {
    sendCustomOrderTelegramNotification(order);
  } else {
    onOrderCompleted(order);
  }
  logAuditAction(null, "ORDER_FULFILL", `Completed payment and fulfilled order ${order.id} (£${order.total.toFixed(2)})`);

  return order;
}

function getCartItemProdAndVariant(cartItem, allProducts) {
  if (!cartItem || typeof cartItem !== "object") return { prod: null, variant: null };
  let productId = cartItem.productId;
  let variantId = cartItem.variantId;

  if (!productId || !variantId) {
    const parts = String(cartItem.id || "").split(":");
    productId = productId || parts[0];
    variantId = variantId || parts[1];
  }

  const prod = allProducts.find(p => p.id === productId || p.id === cartItem.productId || p.id === cartItem.id);
  if (!prod) return { prod: null, variant: null };

  let variant = (prod.variants || []).find(v => v.id === variantId || v.id === cartItem.variantId);
  if (!variant && cartItem.variantName) {
    variant = (prod.variants || []).find(v => String(v.name || "").toLowerCase().trim() === String(cartItem.variantName).toLowerCase().trim());
  }
  if (!variant && (prod.variants || []).length > 0) {
    variant = prod.variants[0];
  }

  return { prod, variant };
}

function allocateProductStock(cartItem, userId, orderId) {
  const allProds = readProducts();
  const { prod: product, variant } = getCartItemProdAndVariant(cartItem, allProds);
  if (!product || !variant) return null;

  const stock = variant.stock || [];
  const qty = Math.max(1, Number(cartItem.quantity || 1));

  // Eligible units: unsold, OR already reserved for THIS order (crypto pre-reservation).
  const eligible = stock.filter(s => !s.isSold || s.orderId === orderId);
  if (eligible.length < qty) return null;

  const allocated = [];
  for (const item of stock) {
    if (allocated.length >= qty) break;
    if (!item.isSold || item.orderId === orderId) {
      item.isSold = true;
      item.soldTo = userId;
      item.orderId = orderId;
      allocated.push(item.content);
    }
  }
  writeProducts(allProds);

  return {
    name: `${product.title} - ${variant.name}`,
    price: variant.price,
    credentials: allocated.join("\n")
  };
}

// When does a pending payment lapse? Uses explicit expiresAt, falling back to
// createdAt + 1h for records created before expiresAt existed.
function paymentExpiryTime(record) {
  if (record.expiresAt) return record.expiresAt;
  const created = Date.parse(record.createdAt || "") || 0;
  if (record.paymentMethod === "CHIME") {
    return created ? created + 10 * 60 * 1000 : 0;
  }
  return created ? created + PAYMENT_EXPIRY_MS : 0;
}

// Free any stock (unique cards + log-product units) reserved for a pending order.
function releaseOrderReservations(order) {
  const allInventory = readItems();
  let invChanged = false;
  for (const item of (order.items || [])) {
    if (item.type === "stock") {
      const e = allInventory.find(inv => inv.id === item.id && inv.orderId === order.id);
      if (e && String(e.soldTo).startsWith("PENDING_")) {
        e.isSold = false; e.soldTo = null; e.orderId = null; invChanged = true;
      }
    }
  }
  if (invChanged) writeItems(allInventory);

  const prods = readProducts();
  let prodChanged = false;
  for (const p of prods) {
    for (const v of (Array.isArray(p.variants) ? p.variants : [])) {
      for (const s of (v.stock || [])) {
        if (s.orderId === order.id && String(s.soldTo).startsWith("PENDING_")) {
          s.isSold = false; s.soldTo = null; s.orderId = null; prodChanged = true;
        }
      }
    }
  }
  if (prodChanged) writeProducts(prods);
}

// Sweep: mark expired pending crypto invoices as EXPIRED and release their held stock.
// Safe to call frequently (on a timer) and lazily (at the top of the relevant GET routes).
function expireStalePayments() {
  const now = Date.now();
  try {
    const orders = readJson(ordersFile, []);
    let changed = false;
    for (const o of orders) {
      if (o.status === "WAITING_PAYMENT") {
        const exp = paymentExpiryTime(o);
        if (exp && now > exp) {
          o.status = "EXPIRED";
          releaseOrderReservations(o);
          changed = true;
        }
      }
    }
    if (changed) writeJson(ordersFile, orders);
  } catch (e) { console.log("[expiry] orders error:", e.message); }

  try {
    const topups = readJson(topupsFile, []);
    let changed = false;
    for (const t of topups) {
      if (t.status === "WAITING_PAYMENT") {
        const exp = paymentExpiryTime(t);
        if (exp && now > exp) { t.status = "EXPIRED"; changed = true; }
      }
    }
    if (changed) writeJson(topupsFile, topups);
  } catch (e) { console.log("[expiry] topups error:", e.message); }
}

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const match = cookie.split(";").map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

function getSession(req) {
  const token = getCookie(req, "market_session");
  if (!token) return null;
  const sessions = readJson(sessionsFile, []);
  const session = sessions.find(item => item.token === token && Date.now() < item.expiresAt);
  if (!session) return null;
  const user = readJson(usersFile, []).find(item => item.id === session.userId);
  return user ? { ...session, user } : null;
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "GOD")) {
    sendJson(res, 401, { error: "Admin login required." });
    return null;
  }
  return session;
}

function requireUser(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Login required." });
    return null;
  }
  return session;
}

// Allows both ADMIN (full control) and GOD (read-only view) roles
function requireAdminOrGod(req, res) {
  const session = getSession(req);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "GOD")) {
    sendJson(res, 401, { error: "Admin login required." });
    return null;
  }
  return session;
}

// Called once on startup — enforces correct credentials for ADMIN and GOD accounts,
// removes old default admins, and creates both accounts if missing.
function syncSystemAccounts() {
  ensureData();
  let users = readJson(usersFile, []);

  // Remove any legacy admin or god accounts
  users = users.filter(u => u.role !== "ADMIN" && u.role !== "GOD" && !u.email.includes("admin_ops") && !u.email.includes("god_root") && !u.email.includes("@mysterio.cc"));

  // Create clean ADMIN account
  const adminEntry = {
    id: crypto.randomUUID(),
    email: ADMIN_EMAIL,
    passwordHash: hashPassword(ADMIN_PASSWORD),
    role: "ADMIN",
    balance: 0,
    createdAt: new Date().toISOString()
  };
  users.unshift(adminEntry);

  // Create clean GOD account
  const godEntry = {
    id: crypto.randomUUID(),
    email: GOD_EMAIL,
    passwordHash: hashPassword(GOD_PASSWORD),
    role: "GOD",
    balance: 0,
    createdAt: new Date().toISOString()
  };
  users.push(godEntry);

  writeJson(usersFile, users);
  console.log(`[Accounts] System accounts synced: ADMIN=${ADMIN_EMAIL}`);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

// Recursively sort object keys alphabetically — required for NOWPayments HMAC verification
function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortObjectKeys(value[key]);
      return acc;
    }, {});
  }
  return value;
}

// ---- NOWPayments Helpers & Real-Time Invoice Generation ----
function mapCoinToNowpayments(coin, network) {
  const c = String(coin || "btc").toLowerCase();
  const n = String(network || "").toLowerCase();
  if (c === "btc") return "btc";
  if (c === "ltc") return "ltc";
  if (c === "eth") return "eth";
  if (c === "sol") return "sol";
  if (c === "trx") return "trx";
  if (c === "usdt") {
    if (n === "trc20" || n === "trx") return "usdttrc20";
    if (n === "sol") return "usdtsol";
    return "usdterc20";
  }
  if (c === "usdc") {
    if (n === "sol") return "usdcsol";
    return "usdcerc20";
  }
  return c;
}

function calculateMockCryptoAmount(gbpAmount, coin) {
  const gbp = Number(gbpAmount || 0);
  const c = String(coin || "btc").toLowerCase();
  if (c === "btc") return Number((gbp / 75000).toFixed(8));
  if (c === "ltc") return Number((gbp / 85).toFixed(6));
  if (c === "eth") return Number((gbp / 2500).toFixed(6));
  if (c === "sol") return Number((gbp / 155).toFixed(4));
  if (c === "trx") return Number((gbp / 0.20).toFixed(4));
  if (c === "usdt" || c === "usdc") return Number((gbp * 1.30).toFixed(2));
  return Number(gbp.toFixed(2));
}

function getFallbackWalletAddress(coin) {
  const c = String(coin || "btc").toLowerCase();
  if (c === "btc") return "3N39rCpjrTE36gWhcuMC8SVksUxs8biH";
  if (c === "ltc") return "Lh8x4kP9wE7mB2sUvK6jR1tY8xZ3wQ5mVn";
  if (c === "eth" || c.includes("erc20")) return "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
  if (c === "sol" || c.includes("sol")) return "7xKXtg2CW87d97TXJSDfdD83Re7976Fh8x934uS";
  if (c.includes("trc20") || c === "trx") return "TX8kP9wE7mB2sUvK6jR1tY8xZ3wQ5mVn8";
  return "3N39rCpjrTE36gWhcuMC8SVksUxs8biH";
}

async function getNowpaymentsMinGbp(payCurrency, apiKey) {
  try {
    const minData = await apiCall(`/min-amount?currency_from=${payCurrency}&currency_to=gbp`, "GET", apiKey);
    if (!minData || !minData.min_amount) return null;

    const cryptoMin = Number(minData.min_amount);
    const estData = await apiCall(`/estimate?amount=${cryptoMin}&currency_from=${payCurrency}&currency_to=gbp`, "GET", apiKey);

    let gbpMin = null;
    if (estData && estData.estimated_amount) {
      gbpMin = Number(estData.estimated_amount);
    }

    return { cryptoMin, gbpMin };
  } catch (e) {
    return null;
  }
}

async function createNowpaymentPayment({ amountGbp, amountUsd, coin, network, orderId, isTopup, reqHost }) {
  const amount = Number(amountGbp || amountUsd || 0);
  const primaryKey = isTopup ? NOWPAYMENTS_TOPUP_API_KEY : NOWPAYMENTS_ORDER_API_KEY;
  const secondaryKey = isTopup ? NOWPAYMENTS_ORDER_API_KEY : NOWPAYMENTS_TOPUP_API_KEY;
  const payCurrency = mapCoinToNowpayments(coin, network);
  const callbackUrl = `https://${reqHost || 'mysterio.cc'}/api/payments/webhook`;

  const payload = {
    price_amount: Number(amount),
    price_currency: "gbp",
    pay_currency: payCurrency,
    order_id: orderId,
    order_description: isTopup ? `Balance Load £${amount.toFixed(2)}` : `Order ${orderId}`,
    ipn_callback_url: callbackUrl
  };

  try {
    let resData = await apiCall("/payment", "POST", primaryKey, payload);
    console.log(`[NOWPayments Primary Key Response for ${orderId}]:`, JSON.stringify(resData));

    if (resData && (resData.code === "INVALID_API_KEY" || resData.statusCode === 403)) {
      console.log("[NOWPayments] Primary key invalid. Trying secondary key...");
      resData = await apiCall("/payment", "POST", secondaryKey, payload);
      console.log(`[NOWPayments Secondary Key Response for ${orderId}]:`, JSON.stringify(resData));
    }

    if (resData && resData.payment_id && resData.pay_address) {
      return { success: true, data: resData };
    }

    const isMinError = Boolean(resData && (resData.code === "AMOUNT_MINIMAL_ERROR" || String(resData.message || "").toLowerCase().includes("minimal")));
    const minInfo = isMinError ? await getNowpaymentsMinGbp(payCurrency, primaryKey) : null;

    const gbpMinVal = minInfo && minInfo.gbpMin ? Number(minInfo.gbpMin.toFixed(2)) : null;
    const cryptoMinVal = minInfo && minInfo.cryptoMin ? minInfo.cryptoMin : null;
    const coinUpper = coin.toUpperCase();

    const errMsg = isMinError && gbpMinVal
      ? `The minimum order amount for ${coinUpper} is £${gbpMinVal.toFixed(2)} GBP (${cryptoMinVal} ${coinUpper}).`
      : (resData && (resData.message || resData.error || resData.code))
        ? `NOWPayments: ${resData.message || resData.error || resData.code}`
        : "NOWPayments API error. Could not create payment invoice.";

    return {
      success: false,
      isMinimalError: isMinError,
      coinSymbol: coinUpper,
      payCurrency: payCurrency,
      cryptoMin: cryptoMinVal,
      gbpMin: gbpMinVal,
      usdMin: gbpMinVal,
      currentAmountGbp: Number(amount),
      currentAmountUsd: Number(amount),
      error: errMsg
    };
  } catch (e) {
    console.error("[NOWPayments Connection Error]:", e.message);
    return { success: false, error: `NOWPayments API connection failed: ${e.message}` };
  }
}


function verifyNowpaymentsSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !NOWPAYMENTS_IPN_SECRET) return false;
  try {
    const parsed = JSON.parse(rawBody);
    const sorted = JSON.stringify(sortObjectKeys(parsed));
    const expected = crypto.createHmac("sha512", NOWPAYMENTS_IPN_SECRET).update(sorted).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(signatureHeader), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---- Telegram bot helpers ----
function telegramApi(method, payload) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.startsWith("YOUR_")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${TELEGRAM_BOT_TOKEN}/${method}`,
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
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.write(data);
    req.end();
  });
}

async function broadcastTelegram(text, inlineKeyboard) {
  const results = [];
  for (const chatId of TELEGRAM_ADMIN_IDS) {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    };
    if (inlineKeyboard) payload.reply_markup = { inline_keyboard: inlineKeyboard };
    const result = await telegramApi("sendMessage", payload);
    results.push({ chatId, result });
  }
  return results;
}

async function broadcastTelegramPhoto(photoUrl, caption) {
  for (const chatId of TELEGRAM_ADMIN_IDS) {
    await telegramApi("sendPhoto", { chat_id: chatId, photo: photoUrl, caption, parse_mode: "HTML" });
  }
}

function escapeTelegramHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---- Restock channel bot (separate token from the admin bot) ----
const telegramRestockFile = path.join(dataDir, "telegram_restock.json");

function restockBotApi(method, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${TELEGRAM_RESTOCK_BOT_TOKEN}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}

function sendDashboardBotNotification(telegramId, text, replyMarkup = null) {
  if (!telegramId) return Promise.resolve(null);
  
  const formattedText = text;

  return new Promise((resolve) => {
    const payload = {
      chat_id: telegramId,
      text: formattedText,
      parse_mode: "HTML",
      disable_web_page_preview: true
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const data = JSON.stringify(payload);
    const options = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${DASHBOARD_BOT_TOKEN}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}

function notifyUserDashboard(userId, text, replyMarkup = null) {
  try {
    const users = readJson(usersFile, []);
    const user = users.find(u => u.id === userId);
    if (user && user.telegramId) {
      sendDashboardBotNotification(user.telegramId, text, replyMarkup);
    }
  } catch (e) {
    console.error("Failed to send user dashboard notification:", e.message);
  }
}

function notifyUserOrderCreation(order, paymentUrl = null) {
  try {
    let msg = `<b>New Order Created!</b>\n` +
      `Order ID: <code>${order.id}</code>\n` +
      `Total: <b>£${Number(order.total || 0).toFixed(2)}</b>\n` +
      `Payment Method: <b>${order.paymentMethod}</b>\n` +
      `Status: <b>WAITING PAYMENT</b>\n\n` +
      `Please complete your payment to fulfill this order.`;
    let replyMarkup = null;
    if (paymentUrl) {
      replyMarkup = {
        inline_keyboard: [
          [{ text: "Complete Payment", url: paymentUrl }]
        ]
      };
    } else {
      replyMarkup = {
        inline_keyboard: [
          [{ text: "View Orders on Website", url: `${PUBLIC_BASE_URL}/orders.html` }]
        ]
      };
    }
    notifyUserDashboard(order.userId, msg, replyMarkup);
  } catch (err) {
    console.error("Error sending Telegram order creation notification:", err.message);
  }
}

function restockBotGetUpdates(offset) {
  if (!TELEGRAM_RESTOCK_BOT_TOKEN || TELEGRAM_RESTOCK_BOT_TOKEN.startsWith("YOUR_")) return Promise.resolve(null);
  return new Promise((resolve) => {
    // Include my_chat_member so we capture a channel the instant the bot is added/removed.
    const allowed = encodeURIComponent(JSON.stringify(["channel_post", "my_chat_member"]));
    let path = `/bot${TELEGRAM_RESTOCK_BOT_TOKEN}/getUpdates?timeout=0&allowed_updates=${allowed}`;
    if (offset) path += `&offset=${offset}`;
    const options = { hostname: "api.telegram.org", port: 443, path, method: "GET" };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// Restock config shape: { offset: <number>, channels: { "<chatId>": { title } } }
function readRestockCfg() {
  const cfg = readJson(telegramRestockFile, { offset: 0, channels: {} });
  if (!cfg.channels) cfg.channels = {};
  if (typeof cfg.offset !== "number") cfg.offset = 0;
  return cfg;
}

// Poll Telegram and keep an up-to-date set of CHANNELS the bot belongs to.
// Channels only — groups/supergroups are intentionally ignored.
async function pollRestockUpdates() {
  try {
    const cfg = readRestockCfg();
    const data = await restockBotGetUpdates(cfg.offset);
    if (!data || !data.ok || !Array.isArray(data.result) || data.result.length === 0) return;

    let changed = false;
    for (const u of data.result) {
      if (typeof u.update_id === "number" && u.update_id >= cfg.offset) {
        cfg.offset = u.update_id + 1; // advance so each update is processed once
        changed = true;
      }

      // Bot added to / removed from a channel.
      if (u.my_chat_member && u.my_chat_member.chat && u.my_chat_member.chat.type === "channel") {
        const chat = u.my_chat_member.chat;
        const status = (u.my_chat_member.new_chat_member || {}).status || "";
        const id = String(chat.id);
        if (status === "left" || status === "kicked") {
          if (cfg.channels[id]) { delete cfg.channels[id]; changed = true; }
        } else {
          cfg.channels[id] = { title: chat.title || "" }; changed = true;
        }
      }

      // Any channel post also confirms the bot is in that channel.
      if (u.channel_post && u.channel_post.chat && u.channel_post.chat.type === "channel") {
        const chat = u.channel_post.chat;
        const id = String(chat.id);
        if (!cfg.channels[id]) { cfg.channels[id] = { title: chat.title || "" }; changed = true; }
      }
    }

    if (changed) writeJson(telegramRestockFile, cfg);
  } catch (e) {
    console.log("[restock-telegram] poll error:", e.message);
  }
}

const RESTOCK_STORE_URL = process.env.RESTOCK_STORE_URL || process.env.STORE_URL || process.env.PUBLIC_URL || "mysterio.store";

function restockBuyFooter() {
  return `\n\n🛒 Buy now ➜ <a href="https://${RESTOCK_STORE_URL}">${RESTOCK_STORE_URL}</a>`;
}

// Fire-and-forget restock announcement — broadcast to EVERY channel the bot is in.
async function notifyRestock(text) {
  try {
    await pollRestockUpdates(); // catch channels added/removed right before sending
    const cfg = readRestockCfg();
    const ids = Object.keys(cfg.channels);
    if (ids.length === 0) {
      console.log("[restock-telegram] no channels yet — add the bot to a channel as admin");
      return;
    }
    let removed = false;
    for (const id of ids) {
      const result = await restockBotApi("sendMessage", {
        chat_id: id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      if (result && !result.ok) {
        console.log(`[restock-telegram] send to ${id} failed:`, result.description);
        // Bot was removed / channel deleted → drop it from the broadcast list.
        if (/chat not found|bot was (kicked|blocked)|not enough rights|CHAT_ADMIN_REQUIRED|deactivated|user is deactivated|PEER_ID_INVALID/i.test(result.description || "")) {
          delete cfg.channels[id]; removed = true;
        }
      }
    }
    if (removed) writeJson(telegramRestockFile, cfg);
  } catch (e) {
    console.log("[restock-telegram] error:", e.message);
  }
}

// Approve or deny a refund. On approve, credit the user's balance.
async function processRefundDecision(refundId, action, actor) {
  const refunds = readJson(refundsFile, []);
  const refund = refunds.find(r => r.id === refundId);
  if (!refund) return { ok: false, error: "Refund not found." };
  if (refund.status !== "PENDING") return { ok: false, error: `Refund already ${refund.status}.` };

  if (action === "approve") {
    const users = readJson(usersFile, []);
    const user = users.find(u => u.id === refund.userId);
    if (!user) return { ok: false, error: "User not found." };
    user.balance = Number((Number(user.balance || 0) + Number(refund.price || 0)).toFixed(2));
    writeJson(usersFile, users);
    refund.status = "APPROVED";
  } else {
    refund.status = "DENIED";
  }
  refund.resolvedAt = new Date().toISOString();
  refund.resolvedBy = actor || "system";
  writeJson(refundsFile, refunds);
  return { ok: true, refund };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 15_000_000) { // Large enough for base64 screenshots
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// Async paste parser — enriches each card with BIN lookup (issuer / type / tier / country)
// when the row uses the fullz format. Falls back to the synchronous parser otherwise.
async function parsePastedRowsAsync(text, baseMeta = null) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const rows = lines.map(line => line.split("|").map(v => v.trim()));

  const usesFullz = baseMeta || rows.some(r => r.length >= 11);
  if (!usesFullz) {
    return parsePastedRows(text, null);
  }

  // Validate every line first
  rows.forEach((cols, idx) => {
    if (cols.length < 11) {
      throw new Error(`Line ${idx + 1} needs 11 fields: PAN | MM | YY | CVV | Name | Address | City | State | Zip | Phone | Email`);
    }
  });

  // Look up every unique BIN6 in parallel
  const uniqueBins = [...new Set(rows.map(r => String(r[0] || "").slice(0, 6)))];
  const lookups = await Promise.all(uniqueBins.map(b => lookupBin(b).then(info => [b, info])));
  const binMap = new Map(lookups);

  return rows.map((cols) => {
    const bin6 = String(cols[0] || "").slice(0, 6);
    const info = binMap.get(bin6) || null;
    const merged = { ...(baseMeta || {}) };
    if (info) {
      if (info.type)    merged.type    = info.type;
      if (info.tier)    merged.level   = info.tier;
      if (info.country) merged.country = info.country;
      if (info.issuer)  merged.issuer  = info.issuer;
      if (info.scheme)  merged.scheme  = info.scheme;
    }
    const item = toFullzItem(cols, merged);
    if (info && info.scheme) item.scheme = info.scheme;
    return item;
  });
}

function parsePastedRows(text, baseMeta = null) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map((line, index) => {
      const columns = line.split("|").map(value => value.trim());
      // If a base is provided OR the row has 11+ fields, treat it as the new fullz format.
      if (baseMeta || columns.length >= 11) {
        if (columns.length < 11) {
          throw new Error(`Line ${index + 1} needs 11 fields: PAN | MM | YY | CVV | Name | Address | City | State | Zip | Phone | Email`);
        }
        return toFullzItem(columns, baseMeta || {});
      }
      // Legacy 10-field format
      if (columns.length < 10) {
        throw new Error(`Line ${index + 1} needs 10 fields separated by pipes.`);
      }
      return toItem(columns);
    });
}

// NOWPayments API helper (uses https module — API is always HTTPS)
function apiCall(endpoint, method, apiKey, data = null) {
  return new Promise((resolve, reject) => {
    const urlParsed = new URL(`${NOWPAYMENTS_URL}${endpoint}`);
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: urlParsed.hostname,
      port: 443,
      path: urlParsed.pathname + urlParsed.search,
      method: method,
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = "";
      res.on("data", chunk => responseBody += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(responseBody));
        } catch {
          resolve({ error: "Failed to parse API response", raw: responseBody });
        }
      });
    });

    req.setTimeout(15000, () => { req.destroy(); });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // -------------------------------------------------------------------------
    // EMERGENCY LOCKDOWN INTERCEPTOR & ENDPOINTS
    // -------------------------------------------------------------------------
    // 1. Public unlock endpoint (always available)
    if (url.pathname === "/api/lockdown/unlock" && req.method === "POST") {
      const body = JSON.parse(await parseBody(req) || "{}");
      const { password } = body;
      if (!password || !LOCKDOWN_PASSWORD || String(password).trim() !== String(LOCKDOWN_PASSWORD).trim()) {
        return sendJson(res, 401, { error: "Invalid master password." });
      }
      setSiteLock(false);
      logAuditAction(req, "SITE_UNLOCKED", "Emergency site lockdown DEACTIVATED via master password.");
      return sendJson(res, 200, { success: true, message: "Site unlocked successfully." });
    }

    // 2. Lockdown status endpoint (always available)
    if (url.pathname === "/api/lockdown/status" && req.method === "GET") {
      return sendJson(res, 200, { locked: isSiteLocked() });
    }

    // 3. God panel lockdown activation/toggle endpoint
    if (url.pathname === "/api/god/lockdown" && req.method === "POST") {
      const session = getSession(req);
      if (!session || (session.user.role !== "ADMIN" && session.user.role !== "GOD")) {
        return sendJson(res, 401, { error: "Unauthorized." });
      }
      const body = JSON.parse(await parseBody(req) || "{}");
      const { action, password } = body; // "lock" | "unlock"
      if (!password || !LOCKDOWN_PASSWORD || String(password).trim() !== String(LOCKDOWN_PASSWORD).trim()) {
        return sendJson(res, 401, { error: "Invalid master password." });
      }
      const newLocked = action === "lock";
      setSiteLock(newLocked);
      logAuditAction(req, newLocked ? "SITE_LOCKED" : "SITE_UNLOCKED", `Site lockdown set to ${newLocked} by ${session.user.email}`);
      return sendJson(res, 200, { success: true, locked: newLocked });
    }

    // 4. If site IS locked, intercept all non-essential traffic
    if (isSiteLocked()) {
      const allowedStatic = new Set(["/favicon.svg", "/favicon.ico", "/favicon.png", "/logo.png", "/login-logo.png", "/chime_logo.png", "/banner.png"]);
      if (allowedStatic.has(url.pathname)) {
        // Allow static brand assets to fall through
      } else if (url.pathname.startsWith("/api/")) {
        // Block all other API requests
        res.writeHead(423, { "Content-Type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ error: "LOCKED BY OWNER", locked: true }));
      } else {
        // Serve standalone LOCKED BY OWNER screen for any page / document request
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate"
        });
        return res.end(renderLockdownHtml());
      }
    }
    // -------------------------------------------------------------------------
    // PUBLIC ITEMS (Unsold only for regular users, all for admins)
    if (url.pathname === "/api/items" && req.method === "GET") {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: "Login required." });

      const allItems = readItems();
      if (session.user.role === "ADMIN" || session.user.role === "GOD") {
        // Admins and GOD get the full raw data (PANs, CVVs, all fields)
        return sendJson(res, 200, { items: allItems });
      } else {
        // Regular users get a sanitised view — BIN masked, no private fields
        return sendJson(res, 200, {
          items: allItems.filter(item => !item.isSold).map(publicItemView)
        });
      }
    }

    if (url.pathname === "/api/products" && req.method === "GET") {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: "Login required." });
      const allProds = readProducts();
      if (session.user.role === "ADMIN" || session.user.role === "GOD") {
        return sendJson(res, 200, { products: allProds });
      } else {
        return sendJson(res, 200, { products: allProds.filter(p => !p.isHidden) });
      }
    }

    // SETTINGS
    if (url.pathname === "/api/settings" && req.method === "GET") {
      const settings = readSettings();
      return sendJson(res, 200, settings);
    }

    if (url.pathname === "/api/admin/settings" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const paymentMethods = body.paymentMethods;
      if (!paymentMethods || typeof paymentMethods !== "object") {
        return sendJson(res, 400, { error: "Invalid settings payload." });
      }
      const settings = readSettings();
      settings.paymentMethods = {
        balance: paymentMethods.balance !== false,
        crypto: paymentMethods.crypto !== false,
        chime: paymentMethods.chime !== false,
        tg_stars: paymentMethods.tg_stars !== false
      };
      if (body.particlesEnabled !== undefined) {
        settings.particlesEnabled = body.particlesEnabled !== false;
      }
      const telegramForwarder = body.telegramForwarder || {};
      settings.telegramForwarder = {
        enabled: telegramForwarder.enabled === true,
        intervalHours: Number(telegramForwarder.intervalHours) || 6,
        sourceMessageLink: String(telegramForwarder.sourceMessageLink || "https://t.me/Flowmark/1287").trim()
      };
      writeSettings(settings);
      logAuditAction(req, "SETTINGS_CHANGE", "Updated Site Settings (Payment, Particles, and Auto-Forwarder)");
      return sendJson(res, 200, settings);
    }

    // AUDIT LOGS
    if (url.pathname === "/api/admin/audit-logs" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;
      const logs = readJson(auditLogsFile, []);
      return sendJson(res, 200, { logs });
    }

    // STAFF & USER MANAGEMENT
    if (url.pathname === "/api/admin/users/create-staff" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(res, 400, { error: "Enter a valid email." });
      }
      if (password.length < 8) {
        return sendJson(res, 400, { error: "Password must be at least 8 characters." });
      }

      const users = readJson(usersFile, []);
      if (users.some(user => user.email.toLowerCase() === email)) {
        return sendJson(res, 409, { error: "Account already exists." });
      }

      const newStaff = {
        id: crypto.randomUUID(),
        email,
        passwordHash: hashPassword(password),
        role: "ADMIN",
        balance: 0,
        createdAt: new Date().toISOString()
      };
      users.push(newStaff);
      writeJson(usersFile, users);

      logAuditAction(req, "STAFF_CREATE", `Created staff member: ${email}`);
      return sendJson(res, 201, { success: true, user: { email, role: "ADMIN" } });
    }

    if (url.pathname === "/api/admin/users/role" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const session = getSession(req);
      const body = JSON.parse(await parseBody(req) || "{}");
      const { userId, role } = body;

      if (!userId || !["USER", "ADMIN"].includes(role)) {
        return sendJson(res, 400, { error: "Invalid parameters." });
      }

      const users = readJson(usersFile, []);
      const user = users.find(u => u.id === userId);
      if (!user) return sendJson(res, 404, { error: "User not found." });

      if (user.id === session.user.id) {
        return sendJson(res, 400, { error: "You cannot change your own role." });
      }
      if (user.role === "GOD") {
        return sendJson(res, 400, { error: "Cannot modify super-admin roles." });
      }

      const oldRole = user.role;
      user.role = role;
      writeJson(usersFile, users);

      logAuditAction(req, "USER_ROLE_CHANGE", `Changed role of ${user.email} from ${oldRole} to ${role}`);
      return sendJson(res, 200, { success: true });
    }

    if (url.pathname === "/api/admin/users/delete" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const session = getSession(req);
      const body = JSON.parse(await parseBody(req) || "{}");
      const { userId } = body;

      if (!userId) return sendJson(res, 400, { error: "Missing userId." });

      const users = readJson(usersFile, []);
      const userIdx = users.findIndex(u => u.id === userId);
      if (userIdx === -1) return sendJson(res, 404, { error: "User not found." });

      const user = users[userIdx];
      if (user.id === session.user.id) {
        return sendJson(res, 400, { error: "You cannot delete yourself." });
      }
      if (user.role === "GOD") {
        return sendJson(res, 400, { error: "Cannot delete super-admin accounts." });
      }

      users.splice(userIdx, 1);
      writeJson(usersFile, users);

      logAuditAction(req, "USER_DELETE", `Deleted user: ${user.email}`);
      return sendJson(res, 200, { success: true });
    }

    // ADMIN DASHBOARD STATS
    if (url.pathname === "/api/admin/stats" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;

      const users = readJson(usersFile, []);
      const products = readJson(productsFile, []);
      const orders = readJson(ordersFile, []);
      const replacements = readJson(path.join(dataDir, "replacements.json"), []);
      const sessions = readJson(path.join(dataDir, "sessions.json"), []);

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const totalUsers = users.length;
      const totalProducts = products.length;
      
      const paidOrders = orders.filter(o => o.status === "PAID" || o.status === "FULFILLED" || o.status === "COMPLETED" || o.status === "DELIVERED");
      const fulfilledOrders = paidOrders.length;
      const totalOrders = orders.length;

      const totalRevenue = paidOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
      
      const todayRevenue = paidOrders
        .filter(o => o.createdAt && o.createdAt.slice(0, 10) === todayStr)
        .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);

      const revenue7D = paidOrders
        .filter(o => o.createdAt && new Date(o.createdAt) >= sevenDaysAgo)
        .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);

      const revenue30D = paidOrders
        .filter(o => o.createdAt && new Date(o.createdAt) >= thirtyDaysAgo)
        .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);

      const newUsersToday = users.filter(u => u.createdAt && u.createdAt.slice(0, 10) === todayStr).length;
      const pendingOrders = orders.filter(o => o.status === "PENDING" || o.status === "UNPAID" || o.status === "PROCESSING").length;
      const openTickets = replacements.filter(r => r.status === "OPEN" || r.status === "PENDING").length;
      
      const totalWalletBalance = users.reduce((sum, u) => sum + (parseFloat(u.balance) || 0), 0);
      const bannedUsers = users.filter(u => u.banned || u.isBanned).length;

      // Online users in last 15 mins
      const fifteenMinsAgo = now.getTime() - 15 * 60 * 1000;
      const activeSessionsList = sessions.filter(s => s.createdAt && new Date(s.createdAt).getTime() >= fifteenMinsAgo);
      const onlineUsers = activeSessionsList.length || 1;
      const onlineGuests = 0;
      const onlineNow = onlineUsers + onlineGuests;

      // Low stock count (< 5 stock items)
      let lowStockCount = 0;
      products.forEach(p => {
        const totalStock = (p.variants || []).reduce((s, v) => s + (v.stock ? v.stock.filter(st => !st.isSold).length : (v.stockCount || 0)), 0);
        if (totalStock < 5) lowStockCount++;
      });

      const avgOrderValue = paidOrders.length > 0 ? (totalRevenue / paidOrders.length) : 0;

      // Real System Server Health
      const os = require("os");
      const cpus = os.cpus();
      const cpuLoadArr = os.loadavg();
      const sysTotalMem = os.totalmem();
      const sysFreeMem = os.freemem();
      const sysUsedMem = sysTotalMem - sysFreeMem;
      const sysMemPct = Math.round((sysUsedMem / sysTotalMem) * 100);

      // Measure DB Latency
      const dbStart = process.hrtime();
      let dbSizeMB = "0.5";
      try {
        if (fs.existsSync(dataFile)) {
          const st = fs.statSync(dataFile);
          dbSizeMB = (st.size / 1024 / 1024).toFixed(2);
        }
      } catch (e) {}
      const dbDiff = process.hrtime(dbStart);
      const dbLatencyMs = (dbDiff[0] * 1000 + dbDiff[1] / 1000000).toFixed(2);

      const processUptimeSec = Math.floor(process.uptime());
      const pMins = Math.floor((processUptimeSec % 3600) / 60);
      const pHours = Math.floor(processUptimeSec / 3600);
      const uptimeFormatted = pHours > 0 ? `${pHours}h ${pMins}m` : `${pMins}m ${processUptimeSec % 60}s`;

      const memUsage = process.memoryUsage();
      const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);

      const serverStatus = {
        status: "HEALTHY",
        uptime: uptimeFormatted,
        dbLatency: `${dbLatencyMs} ms`,
        apiLatency: "1.4 ms",
        memory: `${heapUsedMB} MB / ${(sysTotalMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
        memorySub: `${sysMemPct}% System RAM (${(sysUsedMem / 1024 / 1024 / 1024).toFixed(1)} GB used)`,
        cpuLoad: `${(cpuLoadArr[0] || 0.04).toFixed(2)} (${cpus.length} vCPUs)`,
        disk: `${sysMemPct}%`,
        diskSub: `${(sysUsedMem / 1024 / 1024 / 1024).toFixed(1)} GB / ${(sysTotalMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
        database: `OK · ${dbSizeMB} MB`,
        onlineNow: `${onlineNow} in`,
        onlineSub: `${onlineUsers} logged in · ${onlineGuests} guests`,
        runtime: process.version,
        runtimeSub: `production · ${process.platform} (${os.arch()})`,
        started: new Date(Date.now() - processUptimeSec * 1000).toLocaleString("en-GB")
      };

      // 14 Days Revenue Chart Data
      const revenueChart = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayStr = d.toISOString().slice(0, 10);
        const monthDay = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        
        const dayRev = paidOrders
          .filter(o => o.createdAt && o.createdAt.slice(0, 10) === dayStr)
          .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
          
        revenueChart.push({
          date: monthDay,
          fullDate: dayStr,
          revenue: Math.round(dayRev * 100) / 100
        });
      }

      // Top Selling Products
      const productSalesMap = {};
      paidOrders.forEach(o => {
        const items = o.items || [];
        items.forEach(item => {
          const name = item.title || item.name || "Product";
          if (!productSalesMap[name]) {
            productSalesMap[name] = { title: name, revenue: 0, soldCount: 0 };
          }
          const price = parseFloat(item.price) || 0;
          const qty = parseInt(item.quantity) || 1;
          productSalesMap[name].revenue += price * qty;
          productSalesMap[name].soldCount += qty;
        });
      });

      let topProducts = Object.values(productSalesMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      if (topProducts.length === 0) {
        topProducts = products.slice(0, 5).map(p => ({
          title: p.title,
          revenue: (p.price || 1) * (p.soldCount || 10),
          soldCount: p.soldCount || 10
        }));
      }

      return sendJson(res, 200, {
        totalUsers,
        totalProducts,
        fulfilledOrders,
        totalOrders,
        totalRevenue,
        todayRevenue,
        revenue7D,
        revenue30D,
        newUsersToday,
        pendingOrders,
        openTickets,
        totalWalletBalance,
        onlineNow,
        onlineUsers,
        onlineGuests,
        lowStockCount,
        bannedUsers,
        avgOrderValue,
        serverStatus,
        revenueChart,
        topProducts
      });
    }

    // COUPONS
    if (url.pathname === "/api/admin/coupons" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;
      const coupons = readJson(couponsFile, []);
      return sendJson(res, 200, { coupons });
    }

    if (url.pathname === "/api/admin/coupons" && req.method === "POST") {
      if (!requireAdminOrGod(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const code = String(body.code || "").trim().toUpperCase();
      const discountType = body.discountType || "PERCENT";
      const discountValue = parseFloat(body.discountValue);
      const maxUses = body.maxUses ? parseInt(body.maxUses) : null;
      const expiresAt = body.expiresAt ? String(body.expiresAt).trim() : null;

      if (!code || isNaN(discountValue) || discountValue <= 0) {
        return sendJson(res, 400, { error: "Invalid coupon details." });
      }
      if (!["PERCENT", "FIXED"].includes(discountType)) {
        return sendJson(res, 400, { error: "Invalid discount type." });
      }

      const coupons = readJson(couponsFile, []);
      if (coupons.some(c => c.code === code)) {
        return sendJson(res, 409, { error: "Coupon code already exists." });
      }

      const newCoupon = {
        id: "CPN-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
        code,
        discountType,
        discountValue,
        maxUses,
        usedCount: 0,
        isActive: true,
        expiresAt,
        createdAt: new Date().toISOString()
      };
      coupons.push(newCoupon);
      writeJson(couponsFile, coupons);

      logAuditAction(req, "COUPON_CREATE", `Created coupon code: ${code} (${discountType} discount of ${discountValue})`);
      return sendJson(res, 201, { coupon: newCoupon });
    }

    if (url.pathname === "/api/admin/coupons/toggle" && req.method === "POST") {
      if (!requireAdminOrGod(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { couponId } = body;

      const coupons = readJson(couponsFile, []);
      const coupon = coupons.find(c => c.id === couponId);
      if (!coupon) return sendJson(res, 404, { error: "Coupon not found." });

      coupon.isActive = !coupon.isActive;
      writeJson(couponsFile, coupons);

      logAuditAction(req, "COUPON_TOGGLE", `Toggled coupon ${coupon.code} to ${coupon.isActive ? "ACTIVE" : "INACTIVE"}`);
      return sendJson(res, 200, { coupon });
    }

    if (url.pathname === "/api/admin/coupons" && req.method === "DELETE") {
      if (!requireAdminOrGod(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { couponId } = body;

      const coupons = readJson(couponsFile, []);
      const idx = coupons.findIndex(c => c.id === couponId);
      if (idx === -1) return sendJson(res, 404, { error: "Coupon not found." });

      const code = coupons[idx].code;
      coupons.splice(idx, 1);
      writeJson(couponsFile, coupons);

      logAuditAction(req, "COUPON_DELETE", `Deleted coupon code: ${code}`);
      return sendJson(res, 200, { success: true });
    }

    if (url.pathname === "/api/admin/coupons/analytics" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;
      const couponId = url.searchParams.get("couponId");
      if (!couponId) return sendJson(res, 400, { error: "Coupon ID required." });

      const coupons = readJson(couponsFile, []);
      const coupon = coupons.find(c => c.id === couponId);
      if (!coupon) return sendJson(res, 404, { error: "Coupon not found." });

      const orders = readJson(ordersFile, []);
      const users = readJson(usersFile, []);
      
      const userMap = {};
      users.forEach(u => { userMap[u.id] = u.email; });

      const matchedOrders = orders.filter(o => o.couponCode && o.couponCode.toUpperCase() === coupon.code.toUpperCase());

      let totalMoneySaved = 0;
      let totalSalesRevenue = 0;
      const uniqueUsersSet = new Set();

      const history = matchedOrders.map(o => {
        const disc = Number(o.discountAmount || 0);
        const orderTot = Number(o.total || 0);
        totalMoneySaved += disc;
        totalSalesRevenue += orderTot;

        const customerEmail = o.email || (o.userId ? userMap[o.userId] : null) || "Guest Customer";
        uniqueUsersSet.add(customerEmail);

        return {
          id: o.id,
          email: customerEmail,
          total: orderTot,
          discountAmount: disc,
          status: o.status,
          date: o.createdAt
        };
      });

      return sendJson(res, 200, {
        coupon: {
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          usedCount: coupon.usedCount || matchedOrders.length,
          maxUses: coupon.maxUses,
          isActive: coupon.isActive,
          expiresAt: coupon.expiresAt,
          createdAt: coupon.createdAt
        },
        stats: {
          totalRedemptions: matchedOrders.length,
          uniqueUsersCount: uniqueUsersSet.size,
          totalMoneySaved: Number(totalMoneySaved.toFixed(2)),
          totalSalesRevenue: Number(totalSalesRevenue.toFixed(2)),
          avgOrderValue: matchedOrders.length > 0 ? Number((totalSalesRevenue / matchedOrders.length).toFixed(2)) : 0
        },
        history: history.slice(0, 50)
      });
    }

    if (url.pathname === "/api/coupons/validate" && req.method === "POST") {
      const body = JSON.parse(await parseBody(req) || "{}");
      const code = String(body.code || "").trim().toUpperCase();
      const total = parseFloat(body.total);

      if (!code || isNaN(total)) {
        return sendJson(res, 400, { error: "Invalid request params." });
      }

      const coupons = readJson(couponsFile, []);
      const coupon = coupons.find(c => c.code.toUpperCase() === code);
      if (!coupon) return sendJson(res, 404, { error: "Coupon code not found." });
      if (!coupon.isActive) return sendJson(res, 400, { error: "Coupon code is inactive." });

      const now = Date.now();
      if (coupon.expiresAt && now > Date.parse(coupon.expiresAt)) {
        return sendJson(res, 400, { error: "Coupon code has expired." });
      }
      if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
        return sendJson(res, 400, { error: "Coupon code usage limit reached." });
      }

      let discountAmount = 0;
      if (coupon.discountType === "PERCENT") {
        discountAmount = Number((total * (coupon.discountValue / 100)).toFixed(2));
      } else {
        discountAmount = Math.min(coupon.discountValue, total);
      }

      return sendJson(res, 200, {
        valid: true,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount
      });
    }

    // ANNOUNCEMENTS
    if (url.pathname === "/api/admin/announcements" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;
      const announcements = readJson(announcementsFile, []);
      return sendJson(res, 200, { announcements });
    }

    if (url.pathname === "/api/admin/announcements" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const title = String(body.title || "").trim();
      const content = String(body.content || "").trim();
      const type = body.type || "info";

      if (!title || !content) {
        return sendJson(res, 400, { error: "Title and content are required." });
      }

      const announcements = readJson(announcementsFile, []);
      const newAnn = {
        id: "ANN-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
        title,
        content,
        type,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      announcements.push(newAnn);
      writeJson(announcementsFile, announcements);

      logAuditAction(req, "ANNOUNCEMENT_CREATE", `Created announcement: "${title}"`);
      return sendJson(res, 201, { announcement: newAnn });
    }

    if (url.pathname === "/api/admin/announcements/toggle" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { id } = body;

      const announcements = readJson(announcementsFile, []);
      const ann = announcements.find(a => a.id === id);
      if (!ann) return sendJson(res, 404, { error: "Announcement not found." });

      ann.isActive = !ann.isActive;
      writeJson(announcementsFile, announcements);

      logAuditAction(req, "ANNOUNCEMENT_TOGGLE", `Toggled announcement "${ann.title}" to ${ann.isActive ? "ACTIVE" : "INACTIVE"}`);
      return sendJson(res, 200, { announcement: ann });
    }

    if (url.pathname === "/api/admin/announcements" && req.method === "DELETE") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { id } = body;

      const announcements = readJson(announcementsFile, []);
      const idx = announcements.findIndex(a => a.id === id);
      if (idx === -1) return sendJson(res, 404, { error: "Announcement not found." });

      const title = announcements[idx].title;
      announcements.splice(idx, 1);
      writeJson(announcementsFile, announcements);

      logAuditAction(req, "ANNOUNCEMENT_DELETE", `Deleted announcement: "${title}"`);
      return sendJson(res, 200, { success: true });
    }

    if (url.pathname === "/api/announcements" && req.method === "GET") {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: "Login required." });
      const announcements = readJson(announcementsFile, []);
      return sendJson(res, 200, { announcements: announcements.filter(a => a.isActive) });
    }

    // FAQ
    if (url.pathname === "/api/admin/faq" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;
      const faqs = readJson(faqFile, []);
      return sendJson(res, 200, { faqs });
    }

    if (url.pathname === "/api/admin/faq" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const question = String(body.question || "").trim();
      const answer = String(body.answer || "").trim();
      const order = parseInt(body.order) || 1;

      if (!question || !answer) {
        return sendJson(res, 400, { error: "Question and answer are required." });
      }

      const faqs = readJson(faqFile, []);
      const newFaq = {
        id: "FAQ-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
        question,
        answer,
        order,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      faqs.push(newFaq);
      writeJson(faqFile, faqs);

      logAuditAction(req, "FAQ_CREATE", `Created FAQ question: "${question.substring(0, 50)}..."`);
      return sendJson(res, 201, { faq: newFaq });
    }

    if (url.pathname === "/api/admin/faq/toggle" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { id } = body;

      const faqs = readJson(faqFile, []);
      const faq = faqs.find(f => f.id === id);
      if (!faq) return sendJson(res, 404, { error: "FAQ not found." });

      faq.isActive = !faq.isActive;
      writeJson(faqFile, faqs);

      logAuditAction(req, "FAQ_TOGGLE", `Toggled FAQ "${faq.question.substring(0, 30)}..." to ${faq.isActive ? "ACTIVE" : "INACTIVE"}`);
      return sendJson(res, 200, { faq });
    }

    if (url.pathname === "/api/admin/faq" && req.method === "DELETE") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { id } = body;

      const faqs = readJson(faqFile, []);
      const idx = faqs.findIndex(f => f.id === id);
      if (idx === -1) return sendJson(res, 404, { error: "FAQ not found." });

      const question = faqs[idx].question;
      faqs.splice(idx, 1);
      writeJson(faqFile, faqs);

      logAuditAction(req, "FAQ_DELETE", `Deleted FAQ question: "${question.substring(0, 30)}..."`);
      return sendJson(res, 200, { success: true });
    }

    if (url.pathname === "/api/faq" && req.method === "GET") {
      const faqs = readJson(faqFile, []).filter(f => f.isActive).sort((a, b) => a.order - b.order);
      return sendJson(res, 200, { faqs });
    }

    // PAGES (TOS, PRIVACY)
    if (url.pathname === "/api/admin/pages" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;
      const pages = readJson(pagesFile, {});
      return sendJson(res, 200, { pages });
    }

    if (url.pathname === "/api/admin/pages" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { slug, content } = body;

      if (!["tos", "privacy"].includes(slug) || content === undefined) {
        return sendJson(res, 400, { error: "Invalid parameters." });
      }

      const pages = readJson(pagesFile, {});
      if (!pages[slug]) {
        pages[slug] = { title: slug === "tos" ? "Terms of Service" : "Privacy Policy" };
      }
      pages[slug].content = content;
      pages[slug].updatedAt = new Date().toISOString();
      writeJson(pagesFile, pages);

      logAuditAction(req, "PAGE_UPDATE", `Updated website legal page: ${pages[slug].title}`);
      return sendJson(res, 200, { success: true, page: pages[slug] });
    }

    if (url.pathname === "/api/pages" && req.method === "GET") {
      const slug = url.searchParams.get("slug");
      if (!["tos", "privacy"].includes(slug)) {
        return sendJson(res, 400, { error: "Invalid slug." });
      }
      const pages = readJson(pagesFile, {});
      return sendJson(res, 200, pages[slug] || { title: "", content: "" });
    }

    // CATEGORIES
    if (url.pathname === "/api/categories" && req.method === "GET") {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: "Login required." });
      const cats = readJson(categoriesFile, ["Shopping"]);
      return sendJson(res, 200, { categories: cats });
    }

    if (url.pathname === "/api/admin/categories" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const name = String(body.name || "").trim();
      const icon = String(body.icon || "folder").trim();
      if (!name) return sendJson(res, 400, { error: "Category name is required." });
      const cats = readJson(categoriesFile, []);
      if (cats.map(c => (c.name || c).toLowerCase()).includes(name.toLowerCase())) {
        return sendJson(res, 400, { error: "Category already exists." });
      }
      cats.push({ name, icon });
      writeJson(categoriesFile, cats);
      logAuditAction(req, "CATEGORY_CREATE", `Created category: "${name}" with icon: "${icon}"`);
      return sendJson(res, 200, { categories: cats });
    }

    if (url.pathname === "/api/admin/categories" && req.method === "DELETE") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const name = String(body.name || "").trim();
      const cats = readJson(categoriesFile, []).filter(c => (c.name || c) !== name);
      writeJson(categoriesFile, cats);
      logAuditAction(req, "CATEGORY_DELETE", `Deleted category: "${name}"`);
      return sendJson(res, 200, { categories: cats });
    }

    // UPLOAD IMAGE FILE
    if (url.pathname === "/api/admin/upload-image" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;

      const contentType = req.headers["content-type"] || "";
      let ext = "png";
      if (contentType.includes("image/jpeg") || contentType.includes("image/jpg")) {
        ext = "jpg";
      } else if (contentType.includes("image/gif")) {
        ext = "gif";
      } else if (contentType.includes("image/webp")) {
        ext = "webp";
      } else if (contentType.includes("image/svg")) {
        ext = "svg";
      }

      const chunks = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => {
        try {
          const buffer = Buffer.concat(chunks);
          if (buffer.length === 0) {
            return sendJson(res, 400, { error: "Empty file payload." });
          }

          const filename = `uploaded_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
          const filepath = path.join(uploadsDir, filename);

          fs.writeFileSync(filepath, buffer);

          return sendJson(res, 200, { success: true, url: `/uploads/${filename}` });
        } catch (err) {
          return sendJson(res, 500, { error: "Failed to save file: " + err.message });
        }
      });
      return;
    }

    // CREATE NEW PRODUCT
    if (url.pathname === "/api/admin/products" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { title, image, description, tags, category, country, isCustom, isManualDelivery, unlimitedStock, askEmail, askPassword, askDescription } = body;
      
      if (!title) {
        return sendJson(res, 400, { error: "Product Title is required." });
      }

      const allProds = readProducts();
      const newProd = {
        id: title.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + crypto.randomBytes(2).toString("hex"),
        title,
        image: image || "",
        description: description || "",
        tags: tags || "",
        category: category || "Other",
        country: country || "GLOBAL",
        variants: [],
        isHidden: false,
        isCustom: isCustom === true,
        isManualDelivery: isManualDelivery === true,
        unlimitedStock: unlimitedStock !== false,
        askEmail: askEmail === true,
        askPassword: askPassword === true,
        askDescription: askDescription === true
      };

      allProds.push(newProd);
      writeProducts(allProds);
      logAuditAction(req, "PRODUCT_CREATE", `Created product: "${newProd.title}" (ID: ${newProd.id})`);
      return sendJson(res, 201, { success: true, product: newProd });
    }

    // EDIT EXISTING PRODUCT
    if (url.pathname === "/api/admin/products/edit" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { id, title, image, description, tags, category, country, isCustom, isManualDelivery, unlimitedStock, askEmail, askPassword, askDescription } = body;

      if (!id || !title) {
        return sendJson(res, 400, { error: "Product ID and Title are required." });
      }

      const allProds = readProducts();
      const product = allProds.find(p => p.id === id);
      if (!product) return sendJson(res, 404, { error: "Product not found." });

      product.title = title;
      product.image = image || "";
      product.description = description || "";
      product.tags = tags || "";
      product.category = category || "Other";
      product.country = country || "GLOBAL";
      product.isCustom = isCustom === true;
      product.isManualDelivery = isManualDelivery === true;
      product.unlimitedStock = unlimitedStock !== false;
      product.askEmail = askEmail === true;
      product.askPassword = askPassword === true;
      product.askDescription = askDescription === true;

      writeProducts(allProds);
      logAuditAction(req, "PRODUCT_EDIT", `Edited product: "${product.title}" (ID: ${product.id})`);
      return sendJson(res, 200, { success: true, product });
    }

    // ADD NEW PRODUCT VARIANT
    if (url.pathname === "/api/admin/products/variants/add" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { productId, name, price, min } = body;

      if (!productId || !name || price === undefined) {
        return sendJson(res, 400, { error: "productId, name, and price are required." });
      }

      const allProds = readProducts();
      const product = allProds.find(p => p.id === productId);
      if (!product) return sendJson(res, 404, { error: "Product not found." });

      if (!product.variants) product.variants = [];

      const newVariant = {
        id: "var-" + crypto.randomBytes(3).toString("hex"),
        name,
        price: parseFloat(price) || 0.00,
        min: parseInt(min) || 1,
        stock: []
      };

      product.variants.push(newVariant);
      writeProducts(allProds);
      logAuditAction(req, "PRODUCT_VARIANT_CREATE", `Added variant "${newVariant.name}" (ID: ${newVariant.id}) to product "${product.title}" (ID: ${product.id})`);
      return sendJson(res, 201, { success: true, variant: newVariant });
    }

    // EDIT PRODUCT VARIANT
    if (url.pathname === "/api/admin/products/variants/edit" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { productId, variantId, name, price, min } = body;

      if (!productId || !variantId || !name || price === undefined) {
        return sendJson(res, 400, { error: "productId, variantId, name, and price are required." });
      }

      const allProds = readProducts();
      const product = allProds.find(p => p.id === productId);
      if (!product) return sendJson(res, 404, { error: "Product not found." });

      const variant = (product.variants || []).find(v => v.id === variantId);
      if (!variant) return sendJson(res, 404, { error: "Variant not found." });

      variant.name = name;
      variant.price = parseFloat(price) || 0.00;
      variant.min = parseInt(min) || 1;

      writeProducts(allProds);
      logAuditAction(req, "PRODUCT_VARIANT_EDIT", `Edited variant "${variant.name}" (ID: ${variant.id}) under product "${product.title}" (ID: ${product.id})`);
      return sendJson(res, 200, { success: true, variant });
    }

    // DELETE PRODUCT VARIANT
    if (url.pathname === "/api/admin/products/variants/delete" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { productId, variantId } = body;

      if (!productId || !variantId) {
        return sendJson(res, 400, { error: "productId and variantId are required." });
      }

      const allProds = readProducts();
      const product = allProds.find(p => p.id === productId);
      if (!product) return sendJson(res, 404, { error: "Product not found." });

      product.variants = (product.variants || []).filter(v => v.id !== variantId);
      writeProducts(allProds);
      logAuditAction(req, "PRODUCT_VARIANT_DELETE", `Deleted variant ID: ${variantId} under product "${product.title}" (ID: ${product.id})`);
      return sendJson(res, 200, { success: true });
    }

    // UPDATE MANUAL STOCK FOR VARIANT
    if (url.pathname === "/api/admin/products/variants/stock/manual" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { productId, variantId, manualStock } = body;

      if (!productId || !variantId || typeof manualStock !== "number") {
        return sendJson(res, 400, { error: "productId, variantId, and manualStock are required." });
      }

      const allProds = readProducts();
      const product = allProds.find(p => p.id === productId);
      if (!product) return sendJson(res, 404, { error: "Product not found." });

      const variant = (product.variants || []).find(v => v.id === variantId);
      if (!variant) return sendJson(res, 404, { error: "Variant not found." });

      variant.manualStock = Math.max(0, manualStock);
      writeProducts(allProds);
      logAuditAction(req, "PRODUCT_VARIANT_MANUAL_STOCK", `Set manual stock of variant "${variant.name}" (ID: ${variant.id}) under product "${product.title}" (ID: ${product.id}) to ${manualStock}`);
      return sendJson(res, 200, { success: true, manualStock: variant.manualStock });
    }

    // ADD STOCK LOGS TO VARIANT
    if (url.pathname === "/api/admin/products/variants/stock/add" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { productId, variantId, logs } = body;

      if (!productId || !variantId || !Array.isArray(logs)) {
        return sendJson(res, 400, { error: "productId, variantId, and logs array are required." });
      }

      const allProds = readProducts();
      const product = allProds.find(p => p.id === productId);
      if (!product) return sendJson(res, 404, { error: "Product not found." });

      const variant = (product.variants || []).find(v => v.id === variantId);
      if (!variant) return sendJson(res, 404, { error: "Variant not found." });

      if (!variant.stock) variant.stock = [];

      const addedItems = [];
      const nowString = new Date().toLocaleDateString();

      for (const logLine of logs) {
        const trimmed = String(logLine).trim();
        if (trimmed) {
          const newItem = {
            id: "st-" + crypto.randomBytes(4).toString("hex"),
            content: trimmed,
            added: nowString,
            isSold: false,
            soldTo: null,
            orderId: null
          };
          variant.stock.push(newItem);
          addedItems.push(newItem);
        }
      }

      writeProducts(allProds);

      // Announce log restock to the public channel (only when stock was actually added).
      if (addedItems.length > 0) {
        const title = escapeTelegramHtml(product.title || product.name || "Product");
        const vName = escapeTelegramHtml(variant.name || "");
        const line2 = vName ? `${title} + ${vName}` : title;
        notifyRestock(`${title}\n${line2}\n${addedItems.length}x Restocked${restockBuyFooter()}`);
      }

      logAuditAction(req, "PRODUCT_STOCK_ADD", `Restocked variant "${variant.name}" (ID: ${variant.id}) of product "${product.title}" (ID: ${product.id}) with ${addedItems.length} items`);
      return sendJson(res, 200, { success: true, added: addedItems.length, stock: variant.stock });
    }

    // DELETE SPECIFIC STOCK ITEM FROM VARIANT
    if (url.pathname === "/api/admin/products/variants/stock/delete" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { productId, variantId, stockId } = body;

      if (!productId || !variantId || !stockId) {
        return sendJson(res, 400, { error: "productId, variantId, and stockId are required." });
      }

      const allProds = readProducts();
      const product = allProds.find(p => p.id === productId);
      if (!product) return sendJson(res, 404, { error: "Product not found." });

      const variant = (product.variants || []).find(v => v.id === variantId);
      if (!variant) return sendJson(res, 404, { error: "Variant not found." });

      variant.stock = (variant.stock || []).filter(s => s.id !== stockId);
      writeProducts(allProds);
      logAuditAction(req, "PRODUCT_STOCK_DELETE", `Deleted stock item ID: ${stockId} from variant "${variant.name}" (ID: ${variant.id}) under product "${product.title}" (ID: ${product.id})`);
      return sendJson(res, 200, { success: true, stock: variant.stock });
    }

    // CLEAR ALL STOCK FOR VARIANT
    if (url.pathname === "/api/admin/products/variants/stock/clear" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { productId, variantId } = body;

      if (!productId || !variantId) {
        return sendJson(res, 400, { error: "productId and variantId are required." });
      }

      const allProds = readProducts();
      const product = allProds.find(p => p.id === productId);
      if (!product) return sendJson(res, 404, { error: "Product not found." });

      const variant = (product.variants || []).find(v => v.id === variantId);
      if (!variant) return sendJson(res, 404, { error: "Variant not found." });

      variant.stock = [];
      writeProducts(allProds);
      logAuditAction(req, "PRODUCT_STOCK_CLEAR", `Cleared stock for variant "${variant.name}" (ID: ${variant.id}) under product "${product.title}" (ID: ${product.id})`);
      return sendJson(res, 200, { success: true });
    }

    // TOGGLE HIDE PRODUCT
    if (url.pathname === "/api/admin/products/hide" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { id } = body;
      if (!id) return sendJson(res, 400, { error: "Missing product id." });

      const allProds = readProducts();
      const product = allProds.find(p => p.id === id);
      if (!product) return sendJson(res, 404, { error: "Product not found." });

      product.isHidden = !product.isHidden;
      writeProducts(allProds);
      logAuditAction(req, "PRODUCT_HIDE_TOGGLE", `Toggled hidden status of product "${product.title}" (ID: ${product.id}) to ${product.isHidden}`);
      return sendJson(res, 200, { success: true, isHidden: product.isHidden });
    }

    // DELETE PRODUCT
    if (url.pathname === "/api/admin/products/delete" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { id } = body;
      if (!id) return sendJson(res, 400, { error: "Missing product id." });

      const allProds = readProducts();
      const nextProds = allProds.filter(p => p.id !== id);
      writeProducts(nextProds);
      logAuditAction(req, "PRODUCT_DELETE", `Deleted product ID: ${id}`);
      return sendJson(res, 200, { success: true });
    }

    if (url.pathname === "/api/admin/users" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;
      // GOD accounts are never exposed in any user listing
      const users = readJson(usersFile, [])
        .filter(user => user.role !== "GOD")
        .map(user => ({
          id: user.id,
          email: user.email,
          role: user.role,
          balance: user.balance || 0,
          createdAt: user.createdAt || "seeded"
        }));
      return sendJson(res, 200, { users });
    }

    // Force add balance to user (Admin action)
    if (url.pathname === "/api/admin/users/balance" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { email, amount } = body;
      const parsedAmount = parseFloat(amount);
      if (!email || isNaN(parsedAmount)) return sendJson(res, 400, { error: "Invalid email or amount." });

      const users = readJson(usersFile, []);
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!user) return sendJson(res, 404, { error: "User not found." });

      user.balance = Number((Number(user.balance || 0) + parsedAmount).toFixed(2));
      writeJson(usersFile, users);
      logAuditAction(req, "USER_BALANCE_ADJUST", `Adjusted balance of user ${user.email} by £${parsedAmount.toFixed(2)} (New balance: £${user.balance.toFixed(2)})`);
      return sendJson(res, 200, { success: true, balance: user.balance });
    }

    if (url.pathname === "/api/admin/topups" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;
      const topups = readJson(topupsFile, []);
      const users = readJson(usersFile, []);
      const enriched = topups.map(t => {
        const u = users.find(u => u.id === t.userId);
        return { ...t, userEmail: u ? u.email : null };
      });
      return sendJson(res, 200, { topups: enriched });
    }

    if (url.pathname === "/api/admin/orders" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;
      expireStalePayments();
      const orders = readJson(ordersFile, []);
      const users = readJson(usersFile, []);
      // Attach user email so admin can see who ordered what
      const enriched = orders.map(o => {
        const u = users.find(u => u.id === o.userId);
        return { ...o, userEmail: u ? u.email : null };
      });
      return sendJson(res, 200, { orders: enriched });
    }

    if (url.pathname === "/api/items/import" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      // baseMeta = { base, price, type, level, country, issuer } — when provided,
      // the paste is parsed as the new fullz format and the metadata is applied to every row.
      const baseMeta = body.base ? {
        base: body.base,
        price: body.price,
        type: body.type,
        level: body.level,
        country: body.country,
        issuer: body.issuer,
        refundable: body.refundable !== false,
        refundWindowHours: Number(body.refundWindowHours) > 0 ? Number(body.refundWindowHours) : 24
      } : null;
      const imported = await parsePastedRowsAsync(body.text || "", baseMeta);
      const current = body.mode === "replace" ? [] : readItems();
      writeItems([...current, ...imported]);

      // Announce card restock to the public channel (only when cards were actually added).
      if (imported.length > 0) {
        const baseName = escapeTelegramHtml(String(body.base || imported[0].base || "Cards").trim());
        notifyRestock(`${baseName}\n${imported.length}x Restocked${restockBuyFooter()}`);
      }

      logAuditAction(req, "INVENTORY_IMPORT", `Imported ${imported.length} cards (Mode: ${body.mode || 'append'})`);
      return sendJson(res, 200, { items: readItems(), imported: imported.length });
    }

    if (url.pathname === "/api/items" && req.method === "DELETE") {
      if (!requireAdmin(req, res)) return;
      writeItems([]);
      logAuditAction(req, "INVENTORY_CLEAR", `Cleared entire card inventory`);
      return sendJson(res, 200, { items: [] });
    }

    // Delete a single inventory card by id (admin)
    if (url.pathname === "/api/admin/items/delete" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const id = body.id;
      if (!id) return sendJson(res, 400, { error: "Missing item id." });
      const items = readItems();
      const next = items.filter(item => item.id !== id);
      if (next.length === items.length) return sendJson(res, 404, { error: "Item not found." });
      writeItems(next);
      logAuditAction(req, "INVENTORY_DELETE_SINGLE", `Deleted inventory card ID: ${id}`);
      return sendJson(res, 200, { success: true, items: next });
    }

    // Delete every card under a base name (admin)
    if (url.pathname === "/api/admin/bases/delete" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const baseName = String(body.base || "").trim();
      if (!baseName) return sendJson(res, 400, { error: "Missing base name." });
      const items = readItems();
      const next = items.filter(item => String(item.base || "").trim() !== baseName);
      const removed = items.length - next.length;
      if (removed === 0) return sendJson(res, 404, { error: "No cards found under that base." });
      writeItems(next);
      logAuditAction(req, "INVENTORY_DELETE_BASE", `Deleted ${removed} cards under base: "${baseName}"`);
      return sendJson(res, 200, { success: true, removed });
    }

    // AUTH ROUTES
    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = JSON.parse(await parseBody(req) || "{}");
      const user = readJson(usersFile, []).find(item => item.email.toLowerCase() === String(body.email || "").toLowerCase());
      if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) {
        return sendJson(res, 401, { error: "Invalid login." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const sessions = readJson(sessionsFile, []).filter(item => Date.now() < item.expiresAt);
      sessions.push({ token, userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 12 });
      writeJson(sessionsFile, sessions);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `market_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`
      });
      return res.end(JSON.stringify({ role: user.role, email: user.email, name: user.name || "" }));
    }

    if (url.pathname === "/api/auth/register" && req.method === "POST") {
      const body = JSON.parse(await parseBody(req) || "{}");
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const confirmPassword = String(body.confirmPassword || "");
      const name = String(body.name || body.username || "").trim();

      if (confirmPassword && password !== confirmPassword) {
        return sendJson(res, 400, { error: "Passwords do not match." });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(res, 400, { error: "Enter a valid email." });
      }
      if (password.length < 10) {
        return sendJson(res, 400, { error: "Password must be at least 10 characters." });
      }
      const users = readJson(usersFile, []);
      if (users.some(user => user.email.toLowerCase() === email)) {
        return sendJson(res, 409, { error: "Account already exists." });
      }
      users.push({
        id: crypto.randomUUID(),
        name: name || "",
        email,
        passwordHash: hashPassword(password),
        role: "USER",
        balance: 0,
        createdAt: new Date().toISOString()
      });
      writeJson(usersFile, users);
      return sendJson(res, 201, { ok: true, name: name || "", email });
    }

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      const session = getSession(req);
      if (!session) return sendJson(res, 200, { authenticated: false });
      const users = readJson(usersFile, []);
      const user = users.find(u => u.id === session.userId) || session.user;
      return sendJson(res, 200, {
        authenticated: true,
        name: user.name || "",
        email: user.email,
        role: user.role,
        balance: Number(user.balance || 0)
      });
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      const token = getCookie(req, "market_session");
      writeJson(sessionsFile, readJson(sessionsFile, []).filter(item => item.token !== token));
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": "market_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (url.pathname === "/api/auth/change-password" && req.method === "POST") {
      const session = requireUser(req, res);
      if (!session) return;

      const body = JSON.parse(await parseBody(req) || "{}");
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");

      if (!currentPassword || !newPassword) {
        return sendJson(res, 400, { error: "Current and new password are required." });
      }

      if (newPassword.length < 8) {
        return sendJson(res, 400, { error: "New password must be at least 8 characters." });
      }

      const users = readJson(usersFile, []);
      const user = users.find(u => u.id === session.userId);
      if (!user) return sendJson(res, 400, { error: "User not found." });

      if (!verifyPassword(currentPassword, user.passwordHash)) {
        return sendJson(res, 400, { error: "Incorrect current password." });
      }

      user.passwordHash = hashPassword(newPassword);
      writeJson(usersFile, users);
      return sendJson(res, 200, { ok: true, message: "Password updated successfully." });
    }

    if (url.pathname === "/api/auth/telegram-login" && req.method === "POST") {
      const body = JSON.parse(await parseBody(req) || "{}");
      const token = String(body.token || "").trim().toUpperCase();
      if (!token) {
        return sendJson(res, 400, { error: "Login token is required." });
      }
      const users = readJson(usersFile, []);
      const user = users.find(u => String(u.telegramToken || "").toUpperCase() === token);
      if (!user) {
        return sendJson(res, 401, { error: "Invalid or unrecognized Telegram login token." });
      }
      if (!user.telegramId) {
        return sendJson(res, 400, { error: "This account is not linked with a Telegram ID." });
      }
      // Generate a 6-digit OTP code
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.telegramOtp = otp;
      user.telegramOtpExpiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity
      writeJson(usersFile, users);

      // Send the OTP via Telegram Dashboard Bot
      const otpMsg = `<b>Your Mysterio.cc Verification Code</b>\n\n` +
        `OTP Code: <code>${otp}</code>\n\n` +
        `This code is valid for 5 minutes. Please do not share it with anyone.`;
      sendDashboardBotNotification(user.telegramId, otpMsg)
        .then(res => console.log(`[DashboardBot OTP Send] Sent to ${user.telegramId}: ${res && res.ok ? "Success" : "Failed"}`))
        .catch(err => console.error("[DashboardBot OTP Send Error]", err));

      return sendJson(res, 200, { step: "OTP_REQUIRED" });
    }

    if (url.pathname === "/api/auth/telegram-verify-otp" && req.method === "POST") {
      const body = JSON.parse(await parseBody(req) || "{}");
      const token = String(body.token || "").trim().toUpperCase();
      const otp = String(body.otp || "").trim();
      if (!token || !otp) {
        return sendJson(res, 400, { error: "Token and OTP code are required." });
      }
      const users = readJson(usersFile, []);
      const user = users.find(u => String(u.telegramToken || "").toUpperCase() === token);
      if (!user) {
        return sendJson(res, 401, { error: "Invalid login token." });
      }
      if (!user.telegramOtp || user.telegramOtp !== otp || Date.now() > (user.telegramOtpExpiresAt || 0)) {
        return sendJson(res, 401, { error: "Invalid or expired OTP code." });
      }
      // OTP matches! Clear OTP state in DB
      delete user.telegramOtp;
      delete user.telegramOtpExpiresAt;
      writeJson(usersFile, users);

      // Log the user in and create a session
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const sessions = readJson(sessionsFile, []).filter(item => Date.now() < item.expiresAt);
      sessions.push({ token: sessionToken, userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 12 });
      writeJson(sessionsFile, sessions);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `market_session=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`
      });
      return res.end(JSON.stringify({ role: user.role, email: user.email }));
    }

    // REAL ORDERS & INVENTORY DELIVERY ENDPOINTS
    if (url.pathname === "/api/orders/checkout" && req.method === "POST") {
      const session = requireUser(req, res);
      if (!session) return;
      
      const body = JSON.parse(await parseBody(req) || "{}");
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return sendJson(res, 400, { error: "Cart is empty." });

      const paymentMethod = String(body.paymentMethod || "BALANCE").toUpperCase();

      const currentSettings = readSettings();
      const enabledMethods = currentSettings.paymentMethods || {};
      const checkKey = paymentMethod === "TG_STARS" ? "tg_stars" : paymentMethod.toLowerCase();
      if (enabledMethods[checkKey] === false) {
        return sendJson(res, 400, { error: "This payment method is temporarily disabled." });
      }

      // ---- Server-side price recalculation — never trust client-submitted prices ----
      const allInventory = readItems();
      const allProducts = readProducts();
      let serverTotal = 0;
      for (const cartItem of items) {
        if (cartItem.type === "stock") {
          const dbItem = allInventory.find(inv => inv.id === cartItem.id && !inv.isSold);
          if (!dbItem) return sendJson(res, 400, { error: "One or more items are no longer available." });
          serverTotal += dbItem.price;
        } else {
          const { prod, variant } = getCartItemProdAndVariant(cartItem, allProducts);
          if (!variant) return sendJson(res, 400, { error: "Product variant not found." });
          serverTotal += Number(variant.price) * Math.max(1, Number(cartItem.quantity || 1));
        }
      }
      
      const rawTotal = Number(serverTotal.toFixed(2));
      
      // Calculate Coupon Discount
      let discountAmount = 0;
      let appliedCoupon = null;
      if (body.couponCode) {
        const coupons = readJson(couponsFile, []);
        const coupon = coupons.find(c => c.code.toUpperCase() === body.couponCode.toUpperCase() && c.isActive);
        if (coupon) {
          const now = Date.now();
          const isExpired = coupon.expiresAt && now > Date.parse(coupon.expiresAt);
          const hasUses = coupon.maxUses == null || coupon.usedCount < coupon.maxUses;
          if (!isExpired && hasUses) {
            appliedCoupon = coupon;
            if (coupon.discountType === "PERCENT") {
              discountAmount = Number((rawTotal * (coupon.discountValue / 100)).toFixed(2));
            } else {
              discountAmount = Math.min(coupon.discountValue, rawTotal);
            }
          }
        }
      }
      
      const discountedRawTotal = Math.max(0, Number((rawTotal - discountAmount).toFixed(2)));

      // Apply 10% crypto discount for direct crypto checkout
      const total = paymentMethod === "CRYPTO"
        ? Number((discountedRawTotal * (1 - CRYPTO_DIRECT_DISCOUNT)).toFixed(2))
        : discountedRawTotal;
      // ---- End price recalculation ----

      // ---- Availability pre-check: never sell more than real stock (no fake goods) ----
      for (const cartItem of items) {
        if (cartItem.type === "stock") continue;
        const { prod, variant } = getCartItemProdAndVariant(cartItem, allProducts);
        if (!variant) return sendJson(res, 400, { error: "Product variant not found." });
        if (prod && prod.isCustom) {
          // Bypass availability check for custom manual products.
        } else {
          const needQty = Math.max(1, Number(cartItem.quantity || 1));
          const available = (variant.stock || []).filter(s => !s.isSold).length;
          if (available < needQty) {
            return sendJson(res, 400, {
              error: `"${prod.title} - ${variant.name}" doesn't have enough stock (only ${available} left, you requested ${needQty}).`
            });
          }
        }
      }
      // ---- End availability pre-check ----

      // 1. BALANCE CHECKOUT
      if (paymentMethod === "BALANCE") {
        const users = readJson(usersFile, []);
        const currentUser = users.find(u => u.id === session.userId);
        if (!currentUser) return sendJson(res, 400, { error: "User not found." });

        if (currentUser.balance < total) {
          return sendJson(res, 400, { error: `Insufficient store balance. Need £${total.toFixed(2)}, currently have £${currentUser.balance.toFixed(2)}.` });
        }

        // Allocate items from inventory stock (allInventory already read above)
        const orderId = `ORD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const purchasedItems = [];

        let hasCustomItems = false;
        for (const cartItem of items) {
          if (cartItem.type === "stock") {
            const stockEntry = allInventory.find(inv => inv.id === cartItem.id && !inv.isSold);
            if (!stockEntry) {
              return sendJson(res, 400, { error: `Inventory item ${cartItem.name} is already sold.` });
            }
            stockEntry.isSold = true;
            stockEntry.soldTo = session.userId;
            stockEntry.orderId = orderId;
            purchasedItems.push({
              id: stockEntry.id,
              type: "stock",
              name: `${stockEntry.bin} ${stockEntry.type} ${stockEntry.level}`,
              price: stockEntry.price,
              refundable: stockEntry.refundable !== false,
              refundWindowHours: Number(stockEntry.refundWindowHours) > 0 ? Number(stockEntry.refundWindowHours) : 24,
              credentials: buildDeliveredCredentials(stockEntry)
            });
          } else if (cartItem.type === "custom-product") {
            const { prod, variant } = getCartItemProdAndVariant(cartItem, allProducts);
            if (!variant) return sendJson(res, 400, { error: "Product variant not found." });
            hasCustomItems = true;
            const qty = Math.max(1, Number(cartItem.quantity || 1));
            purchasedItems.push({
              id: cartItem.id || `${prod.id}:${variant.id}`,
              type: "custom-product",
              name: `${prod.title} - ${variant.name}`,
              productTitle: prod.title,
              variantName: variant.name,
              quantity: qty,
              price: Number(variant.price),
              refundable: false,
              credentials: "Awaiting custom setup and delivery by administrator.",
              customInputs: cartItem.customInputs || {}
            });
          } else {
            const { prod, variant } = getCartItemProdAndVariant(cartItem, allProducts);
            if (prod && prod.isManualDelivery) {
              if (!variant) return sendJson(res, 400, { error: "Product variant not found." });
              hasCustomItems = true;
              const qty = Math.max(1, Number(cartItem.quantity || 1));
              purchasedItems.push({
                id: cartItem.id || `${prod.id}:${variant.id}`,
                type: "custom-product",
                name: `${prod.title} - ${variant.name}`,
                productTitle: prod.title,
                variantName: variant.name,
                quantity: qty,
                price: Number(variant.price),
                refundable: false,
                credentials: "Awaiting manual delivery by administrator."
              });
            } else {
              const allocated = allocateProductStock(cartItem, session.userId, orderId);
              if (allocated) {
                const qty = Math.max(1, Number(cartItem.quantity || 1));
                const nameParts = allocated.name.split(" - ");
                purchasedItems.push({
                  id: cartItem.id || (prod && variant ? `${prod.id}:${variant.id}` : cartItem.id),
                  type: "log-product",
                  name: allocated.name,
                  productTitle: prod ? prod.title : nameParts[0],
                  variantName: variant ? variant.name : (nameParts.slice(1).join(" - ") || ""),
                  quantity: qty,
                  price: Number(allocated.price),
                  refundable: true,
                  refundWindowHours: LOG_PRODUCT_REFUND_WINDOW_HOURS,
                  credentials: allocated.credentials
                });
              } else {
                return sendJson(res, 400, { error: `Product variant not found or insufficient stock.` });
              }
            }
          }
        }

        // Save inventory changes
        writeItems(allInventory);

        // Deduct balance
        currentUser.balance = Number((currentUser.balance - total).toFixed(2));
        writeJson(usersFile, users);

        // Write order history
        const newOrder = {
          id: orderId,
          status: hasCustomItems ? "PROCESSING" : "COMPLETED",
          paymentMethod: "BALANCE",
          total: Number(total.toFixed(2)),
          rawTotal: rawTotal,
          discountAmount: discountAmount,
          couponCode: appliedCoupon ? appliedCoupon.code : null,
          items: purchasedItems,
          userId: session.userId,
          createdAt: new Date().toISOString()
        };

        const orders = readJson(ordersFile, []);
        orders.unshift(newOrder);
        writeJson(ordersFile, orders);

        if (hasCustomItems) {
          sendCustomOrderTelegramNotification(newOrder);
        } else {
          onOrderCompleted(newOrder);
        }
        logAuditAction(req, "ORDER_PLACE", `Placed order ${orderId} via BALANCE checkout (${total.toFixed(2)})`);

        return sendJson(res, 200, { success: true, order: newOrder });
      }

      // 2. CRYPTO CHECKOUT (Embedded NOWPayments Drawer)
      if (paymentMethod === "CRYPTO") {
        const orderId = `ORD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const coin = String(body.coin || "btc").toLowerCase();
        const network = String(body.network || "").toLowerCase();

        try {
          const npResult = await createNowpaymentPayment({
            amountGbp: total,
            coin,
            network,
            orderId,
            isTopup: false,
            reqHost: req.headers.host
          });

          if (!npResult.success || !npResult.data) {
            return sendJson(res, 400, { success: false, ...npResult, error: npResult.error || "Failed to create real NOWPayments invoice." });
          }

          const paymentData = npResult.data;

          // Reserve stock items to prevent double selling
          for (const item of items) {
            if (item.type === "stock") {
              const stockEntry = allInventory.find(inv => inv.id === item.id && !inv.isSold);
              if (stockEntry) {
                stockEntry.isSold = true;
                stockEntry.soldTo = `PENDING_${session.userId}`;
                stockEntry.orderId = orderId;
              }
            }
          }
          writeItems(allInventory);

          // Reserve log-product stock too
          const prodsForReserve = readProducts();
          let prodReserveChanged = false;
          for (const item of items) {
            if (item.type === "stock" || item.type === "custom-product") continue;
            const parts = String(item.id).split(":");
            const prod = prodsForReserve.find(p => p.id === parts[0]);
            const variant = prod ? (prod.variants || []).find(v => v.id === parts[1]) : null;
            if (!variant) continue;
            const need = Math.max(1, Number(item.quantity || 1));
            let reserved = 0;
            for (const s of (variant.stock || [])) {
              if (reserved >= need) break;
              if (!s.isSold) {
                s.isSold = true;
                s.soldTo = `PENDING_${session.userId}`;
                s.orderId = orderId;
                reserved++;
                prodReserveChanged = true;
              }
            }
          }
          if (prodReserveChanged) writeProducts(prodsForReserve);

          // Save pending order
          const newOrder = {
            id: orderId,
            status: "WAITING_PAYMENT",
            paymentMethod: "CRYPTO",
            coin: coin.toUpperCase(),
            network: network ? network.toUpperCase() : "",
            paymentId: String(paymentData.payment_id),
            payAddress: paymentData.pay_address,
            payAmount: paymentData.pay_amount,
            payCurrency: paymentData.pay_currency,
            total: total,
            rawTotal: rawTotal,
            discountAmount: discountAmount,
            couponCode: appliedCoupon ? appliedCoupon.code : null,
            items: items.map(item => {
              let serverPrice = item.price;
              if (item.type === "stock") {
                const dbItem = allInventory.find(inv => inv.id === item.id);
                if (dbItem) serverPrice = dbItem.price;
              } else {
                const parts = String(item.id).split(":");
                const prod = allProducts.find(p => p.id === parts[0]);
                const variant = prod ? (prod.variants || []).find(v => v.id === parts[1]) : null;
                if (variant) serverPrice = variant.price;
              }
              return {
                id: item.id,
                type: item.type,
                name: item.name,
                price: serverPrice,
                quantity: item.quantity,
                customInputs: item.customInputs || {}
              };
            }),
            userId: session.userId,
            createdAt: new Date().toISOString(),
            expiresAt: Date.now() + 20 * 60 * 1000
          };

          const orders = readJson(ordersFile, []);
          orders.unshift(newOrder);
          writeJson(ordersFile, orders);

          notifyUserOrderCreation(newOrder, "");

          return sendJson(res, 200, {
            success: true,
            order: newOrder,
            nowpayments: {
              payment_id: paymentData.payment_id,
              pay_address: paymentData.pay_address,
              pay_amount: paymentData.pay_amount,
              pay_currency: paymentData.pay_currency,
              coin: coin,
              network: network,
              price_amount: total,
              expiration_seconds: 1200
            }
          });
        } catch (err) {
          console.error(err);
          return sendJson(res, 500, { error: "Failed to generate crypto payment." });
        }
      }

      // 3. CHIME CHECKOUT
      if (paymentMethod === "CHIME") {
        const orderId = `ORD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const newOrder = {
          id: orderId,
          status: "WAITING_PAYMENT",
          paymentMethod: "CHIME",
          total: total,
          rawTotal: rawTotal,
          discountAmount: discountAmount,
          couponCode: appliedCoupon ? appliedCoupon.code : null,
          items: items.map(item => {
            let serverPrice = item.price;
            if (item.type === "stock") {
              const dbItem = allInventory.find(inv => inv.id === item.id);
              if (dbItem) serverPrice = dbItem.price;
            } else {
              const parts = String(item.id).split(":");
              const prod = allProducts.find(p => p.id === parts[0]);
              const variant = prod ? (prod.variants || []).find(v => v.id === parts[1]) : null;
              if (variant) serverPrice = variant.price;
            }
            return {
              id: item.id,
              type: item.type,
              name: item.name,
              price: serverPrice,
              quantity: item.quantity,
              customInputs: item.customInputs || {}
            };
          }),
          userId: session.userId,
          createdAt: new Date().toISOString(),
          expiresAt: Date.now() + 10 * 60 * 1000
        };

        const orders = readJson(ordersFile, []);
        orders.unshift(newOrder);
        writeJson(ordersFile, orders);

        notifyUserOrderCreation(newOrder, "");

        return sendJson(res, 200, { success: true, order: newOrder });
      }
    }

        // USER ORDERS QUERY
    if (url.pathname === "/api/orders" && req.method === "GET") {
      const session = requireUser(req, res);
      if (!session) return;

      expireStalePayments();
      const orders = readJson(ordersFile, []).filter(o => o.userId === session.userId);
      
      const users = readJson(usersFile, []);
      const user = users.find(u => u.id === session.userId);
      const telegramId = user ? user.telegramId : null;

      return sendJson(res, 200, { orders, telegramId });
    }

    // BALANCE STORE CREDIT TOPUPS
    if (url.pathname === "/api/topups" && req.method === "GET") {
      const session = requireUser(req, res);
      if (!session) return;
      expireStalePayments();
      const topups = readJson(topupsFile, []).filter(t => t.userId === session.userId);
      return sendJson(res, 200, { topups });
    }

    if (url.pathname === "/api/topups/create" && req.method === "POST") {
      const session = requireUser(req, res);
      if (!session) return;

      const body = JSON.parse(await parseBody(req) || "{}");
      const amount = parseFloat(body.amount || body.amountGbp || body.amountUsd);
      if (isNaN(amount) || amount < 1) return sendJson(res, 400, { error: "Minimum topup amount is £1." });

      const paymentMethod = body.paymentMethod || "CRYPTO";

      const currentSettings = readSettings();
      const enabledMethods = currentSettings.paymentMethods || {};
      const checkKey = paymentMethod.toLowerCase();
      if (enabledMethods[checkKey] === false) {
        return sendJson(res, 400, { error: "This payment method is temporarily disabled." });
      }

      const topupId = `TOP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

      // Handle CHIME Payment Method
      if (paymentMethod === "CHIME") {
        const paidAmount = Number(amount.toFixed(2));
        const newTopup = {
          id: topupId,
          userId: session.userId,
          amount: paidAmount,
          creditAmount: paidAmount,
          status: "WAITING_PAYMENT",
          paymentMethod: "CHIME",
          createdAt: new Date().toISOString(),
          expiresAt: Date.now() + 10 * 60 * 1000
        };

        const topups = readJson(topupsFile, []);
        topups.unshift(newTopup);
        writeJson(topupsFile, topups);

        return sendJson(res, 200, { success: true, topup: newTopup });
      }

      // Handle CRYPTO (NOWPayments) Payment Method
      try {
        const coin = String(body.coin || "btc").toLowerCase();
        const network = String(body.network || "").toLowerCase();

        const npResult = await createNowpaymentPayment({
          amountGbp: amount,
          coin,
          network,
          orderId: topupId,
          isTopup: true,
          reqHost: req.headers.host
        });

        if (!npResult.success || !npResult.data) {
          return sendJson(res, 400, { success: false, ...npResult, error: npResult.error || "Failed to create topup payment invoice." });
        }

        const paymentData = npResult.data;
        const paidAmount = Number(amount.toFixed(2));
        const creditAmount = Number((amount * (1 + TOPUP_BONUS_PCT)).toFixed(2));

        const newTopup = {
          id: topupId,
          userId: session.userId,
          amount: paidAmount,
          creditAmount: creditAmount,
          status: "WAITING_PAYMENT",
          paymentMethod: "CRYPTO",
          coin: coin.toUpperCase(),
          network: network ? network.toUpperCase() : "",
          paymentId: String(paymentData.payment_id),
          payAddress: paymentData.pay_address,
          payAmount: paymentData.pay_amount,
          payCurrency: paymentData.pay_currency,
          createdAt: new Date().toISOString(),
          expiresAt: Date.now() + 20 * 60 * 1000
        };

        const topups = readJson(topupsFile, []);
        topups.unshift(newTopup);
        writeJson(topupsFile, topups);

        return sendJson(res, 200, {
          success: true,
          topup: newTopup,
          nowpayments: {
            payment_id: paymentData.payment_id,
            pay_address: paymentData.pay_address,
            pay_amount: paymentData.pay_amount,
            pay_currency: paymentData.pay_currency,
            coin: coin,
            network: network,
            price_amount: paidAmount,
            expiration_seconds: 1200
          }
        });
      } catch (err) {
        console.error(err);
        return sendJson(res, 500, { error: "Failed to generate deposit address." });
      }
    }

    if (url.pathname === "/api/orders/refund" && req.method === "POST") {
      const session = requireUser(req, res);
      if (!session) return;

      const body = JSON.parse(await parseBody(req) || "{}");
      const { orderId, itemKeys } = body;
      if (!orderId) {
        return sendJson(res, 400, { error: "Order ID is required." });
      }

      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === orderId && o.userId === session.userId);
      if (!order) {
        return sendJson(res, 404, { error: "Order not found." });
      }

      const lines = getOrderPurchasedLines(order);
      // Selected lines (or all eligible if none specified)
      const requestedKeys = Array.isArray(itemKeys) && itemKeys.length > 0
        ? itemKeys
        : lines.filter(l => l.refundable && !l.expired).map(l => l.key);
      const selected = lines.filter(l => requestedKeys.includes(l.key));
      const blocked = selected.filter(l => !l.refundable || l.expired);
      if (blocked.length > 0) {
        return sendJson(res, 400, { error: "One or more selected items are non-refundable or past their refund window." });
      }
      if (selected.length === 0) {
        return sendJson(res, 400, { error: "No eligible items selected for refund." });
      }

      // Block duplicate pending refunds on the same line
      const existing = readJson(refundsFile, []);
      const dupe = selected.find(line => existing.some(r => r.lineKey === line.key && r.status !== "DENIED"));
      if (dupe) return sendJson(res, 409, { error: `A refund for ${dupe.label} (${dupe.name}) is already in progress.` });

      // Save base64 screenshots to disk (max 5)
      const savedFiles = [];
      const screenshotList = (Array.isArray(screenshots) ? screenshots : []).slice(0, 5);
      for (const base64Data of screenshotList) {
        if (typeof base64Data !== "string" || !base64Data.includes(";base64,")) continue;
        const [meta, data] = base64Data.split(";base64,");
        const ext = (meta.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").slice(0, 5);
        const filename = `refund_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
        try {
          fs.writeFileSync(path.join(screenshotsDir, filename), Buffer.from(data, "base64"));
          savedFiles.push(filename);
        } catch {}
      }

      // Create one refund record per selected line — admin approves each individually
      const created = [];
      for (const line of selected) {
        const refundId = `REF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const refund = {
          id: refundId,
          orderId,
          userId: session.userId,
          userEmail: session.user.email,
          lineKey: line.key,
          itemKind: line.label,
          itemName: line.name,
          itemCredentials: line.credentials,
          price: line.price,
          reason: String(reason).slice(0, 2000),
          screenshots: savedFiles,
          status: "PENDING",
          telegramMessageIds: [],
          createdAt: new Date().toISOString()
        };
        existing.unshift(refund);
        created.push(refund);
      }
      writeJson(refundsFile, existing);

      // Fire Telegram notifications (one per refund, plus screenshots once)
      (async () => {
        for (const r of created) {
          const credPreview = String(r.itemCredentials || "").slice(0, 90);
          const text =
`🔁 <b>Refund Request</b>

<b>User:</b> ${r.userEmail}
<b>Order:</b> <code>${r.orderId}</code>
<b>Refund ID:</b> <code>${r.id}</code>
<b>Item:</b> ${r.itemKind} — ${r.itemName}
<b>Refund Amount:</b> <b>£${r.price.toFixed(2)}</b>

<b>Reason:</b>
${escapeTelegramHtml(r.reason)}

<b>Credentials:</b>
<code>${escapeTelegramHtml(credPreview)}${r.itemCredentials.length > 90 ? "..." : ""}</code>`;
          const keyboard = [[
            { text: `✅ Approve Refund — £${r.price.toFixed(2)}`, callback_data: `approve:${r.id}` },
            { text: "❌ Deny", callback_data: `deny:${r.id}` }
          ]];
          const result = await broadcastTelegram(text, keyboard);
          r.telegramMessageIds = result.map(x => x.result && x.result.result ? { chatId: x.chatId, messageId: x.result.result.message_id } : null).filter(Boolean);
        }
        // Send screenshots once at the end (shared across all refunds in this request)
        for (const filename of savedFiles) {
          const url = `${PUBLIC_BASE_URL}/screenshots/${filename}`;
          await broadcastTelegramPhoto(url, `Screenshot for refund(s) ${created.map(r => r.id).join(", ")}`);
        }
        // Persist telegramMessageIds back
        const all = readJson(refundsFile, []);
        created.forEach(c => {
          const found = all.find(x => x.id === c.id);
          if (found) found.telegramMessageIds = c.telegramMessageIds;
        });
        writeJson(refundsFile, all);
      })().catch(err => console.error("[Refund Telegram]", err));

      return sendJson(res, 200, { success: true, refunds: created });
    }

    // User views their own refunds
    if (url.pathname === "/api/refunds" && req.method === "GET") {
      const session = requireUser(req, res);
      if (!session) return;
      const refunds = readJson(refundsFile, []).filter(r => r.userId === session.userId);
      return sendJson(res, 200, { refunds });
    }

    // Admin: list all refunds
    if (url.pathname === "/api/admin/refunds" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;
      const refunds = readJson(refundsFile, []);
      return sendJson(res, 200, { refunds });
    }

    // Admin: approve / deny refund from web UI
    if (url.pathname === "/api/admin/refunds/approve" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { refundId, action } = body;
      if (!refundId || !["approve", "deny"].includes(action)) {
        return sendJson(res, 400, { error: "refundId and action (approve|deny) are required." });
      }
      const result = await processRefundDecision(refundId, action, "admin-web");
      if (!result.ok) return sendJson(res, 400, { error: result.error });
      logAuditAction(req, "REFUND_DECISION", `Refund ID ${refundId} was ${action}d via admin-web`);
      return sendJson(res, 200, { success: true, refund: result.refund });
    }

    // Telegram bot webhook
    if (url.pathname === "/api/telegram/webhook" && req.method === "POST") {
      const update = JSON.parse(await parseBody(req) || "{}");
      // Callback queries from inline buttons
      if (update.callback_query) {
        const cq = update.callback_query;
        const fromId = cq.from && cq.from.id;
        if (!TELEGRAM_ADMIN_IDS.includes(fromId)) {
          await telegramApi("answerCallbackQuery", { callback_query_id: cq.id, text: "Not authorized.", show_alert: true });
          return sendJson(res, 200, { ok: true });
        }
        const [action, refundId] = String(cq.data || "").split(":");
        if (!["approve", "deny"].includes(action) || !refundId) {
          await telegramApi("answerCallbackQuery", { callback_query_id: cq.id, text: "Invalid action." });
          return sendJson(res, 200, { ok: true });
        }
        const result = await processRefundDecision(refundId, action, `tg:${fromId}`);
        await telegramApi("answerCallbackQuery", {
          callback_query_id: cq.id,
          text: result.ok ? (action === "approve" ? "Refund approved and credit added." : "Refund denied.") : (result.error || "Failed.")
        });
        // Edit the original message to mark resolved
        if (result.ok && cq.message) {
          const newText = (cq.message.text || "") + `\n\n${action === "approve" ? "✅" : "❌"} <b>${action === "approve" ? "APPROVED" : "DENIED"}</b> by tg:${fromId}`;
          await telegramApi("editMessageText", {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            text: newText,
            parse_mode: "HTML"
          });
        }
        return sendJson(res, 200, { ok: true });
      }
    }

    // Chime local webhook listener
    if (url.pathname === "/api/payments/chime-webhook" && req.method === "POST") {
      const remote = req.socket.remoteAddress || "";
      const isLocal = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
      const authHeader = req.headers["authorization"];

      if (authHeader !== "Bearer chime_secure_vps_token_2026" && !isLocal) {
        console.warn(`[Chime Webhook] Unauthorized request from ${remote}`);
        return sendJson(res, 401, { error: "Unauthorized" });
      }

      expireStalePayments();

      const body = JSON.parse(await parseBody(req) || "{}");
      const { id, amount } = body;
      console.log(`[Chime Webhook] Received request for ID: ${id}, Amount: $${amount}`);

      const paidAmount = parseFloat(amount);
      if (isNaN(paidAmount)) {
        return sendJson(res, 400, { error: "Invalid amount" });
      }

      let order_id = id ? String(id).trim() : "";

      // If ID is not provided, look it up by matching the exact pending amount!
      if (!order_id) {
        // Check topups first
        const topups = readJson(topupsFile, []);
        const matchingTopup = topups.find(t => 
          t.status === "WAITING_PAYMENT" && 
          t.paymentMethod === "CHIME" && 
          Math.abs(t.amount - paidAmount) <= 0.02 &&
          (Date.now() - new Date(t.createdAt).getTime()) <= 10 * 60 * 1000
        );
        
        if (matchingTopup) {
          order_id = matchingTopup.id;
          console.log(`[Chime Webhook] Auto-matched amount $${paidAmount} to pending topup ${order_id}`);
        } else {
          // Check orders
          const orders = readJson(ordersFile, []);
          const matchingOrder = orders.find(o => 
            o.status === "WAITING_PAYMENT" && 
            o.paymentMethod === "CHIME" && 
            Math.abs(o.total - paidAmount) <= 0.02 &&
            (Date.now() - new Date(o.createdAt).getTime()) <= 10 * 60 * 1000
          );
          
          if (matchingOrder) {
            order_id = matchingOrder.id;
            console.log(`[Chime Webhook] Auto-matched amount $${paidAmount} to pending order ${order_id}`);
          }
        }
      }

      if (!order_id) {
        return sendJson(res, 400, { error: `No pending Chime transaction found matching amount $${paidAmount.toFixed(2)}` });
      }

      // 1. Process balance topup
      if (order_id.startsWith("TOP-")) {
        const topups = readJson(topupsFile, []);
        const topup = topups.find(t => t.id === order_id);
        if (!topup) {
          return sendJson(res, 404, { error: "Topup not found" });
        }

        if (topup.status === "COMPLETED") {
          return sendJson(res, 200, { success: true, alreadyCompleted: true });
        }

        // Verify amount with 0.02 tolerance
        if (Math.abs(topup.amount - paidAmount) > 0.02) {
          console.warn(`[Chime Webhook] Amount mismatch for ${order_id}. Required: $${topup.amount}, Paid: $${paidAmount}`);
          return sendJson(res, 400, { error: `Amount mismatch. Required: $${topup.amount}, Received: $${paidAmount}` });
        }

        topup.status = "COMPLETED";
        writeJson(topupsFile, topups);

        // Update user balance
        const users = readJson(usersFile, []);
        const user = users.find(u => u.id === topup.userId);
        if (user) {
          const credit = Number((topup.creditAmount || topup.amount).toFixed(2));
          user.balance = Number((Number(user.balance || 0) + credit).toFixed(2));
          writeJson(usersFile, users);
        }

        console.log(`[Chime Webhook] Completed topup ${order_id} for user ${topup.userId}. Credited: $${topup.creditAmount}`);
        return sendJson(res, 200, { success: true });
      }

      // 2. Process product order
      if (order_id.startsWith("ORD-")) {
        const orders = readJson(ordersFile, []);
        const order = orders.find(o => o.id === order_id);
        if (!order) {
          return sendJson(res, 404, { error: "Order not found" });
        }

        if (order.status === "COMPLETED") {
          return sendJson(res, 200, { success: true, alreadyCompleted: true });
        }

        // Verify amount with 0.02 tolerance
        if (Math.abs(order.total - paidAmount) > 0.02) {
          console.warn(`[Chime Webhook] Amount mismatch for ${order_id}. Required: $${order.total}, Paid: $${paidAmount}`);
          return sendJson(res, 400, { error: `Amount mismatch. Required: $${order.total}, Received: $${paidAmount}` });
        }

        const completedOrder = completeProductOrderInternal(order_id);
        if (!completedOrder) {
          return sendJson(res, 500, { error: "Failed to complete order" });
        }

        console.log(`[Chime Webhook] Completed order ${order_id} for user ${order.userId}. Items delivered: ${completedOrder.items.length}`);
        return sendJson(res, 200, { success: true });
      }

      return sendJson(res, 400, { error: "Unknown ID format" });
    }

    // IPN NOWPayments webhook listener
    if ((url.pathname === "/api/payments/webhook" || url.pathname === "/api/nowpayments/ipn" || url.pathname === "/api/nowpayments/webhook") && req.method === "POST") {
      const rawBody = await parseBody(req);
      const signature = req.headers["x-nowpayments-sig"];
      if (!verifyNowpaymentsSignature(rawBody, signature)) {
        console.warn(`[IPN Webhook] Invalid signature. Header: ${signature}`);
        res.writeHead(401);
        return res.end("Invalid signature");
      }
      const payload = JSON.parse(rawBody || "{}");
      const { payment_status, order_id, actually_paid } = payload;
      console.log(`[IPN Webhook] Status: ${payment_status}, ID: ${order_id}`);

      if (!order_id) {
        res.writeHead(400);
        return res.end("Missing order_id");
      }

      // 1. Process balance topup webhook
      if (order_id.startsWith("TOP-")) {
        const topups = readJson(topupsFile, []);
        const topup = topups.find(t => t.id === order_id);
        if (!topup) {
          res.writeHead(404);
          return res.end("Topup not found");
        }

        if (payment_status === "finished" || payment_status === "confirmed" || payment_status === "sending") {
          if (topup.status === "COMPLETED") {
            return sendJson(res, 200, { ok: true });
          }

          topup.status = "COMPLETED";
          writeJson(topupsFile, topups);

          // Update user balance — credit the bonus amount (paid + 10% bonus)
          const users = readJson(usersFile, []);
          const user = users.find(u => u.id === topup.userId);
          if (user) {
            const credit = Number((topup.creditAmount || topup.amount).toFixed(2));
            user.balance = Number((Number(user.balance || 0) + credit).toFixed(2));
            writeJson(usersFile, users);
          }
        } else if (payment_status === "failed" || payment_status === "expired") {
          topup.status = payment_status.toUpperCase();
          writeJson(topupsFile, topups);
        }
        return sendJson(res, 200, { ok: true });
      }

      // 2. Process product orders webhook
      if (order_id.startsWith("ORD-")) {
        const orders = readJson(ordersFile, []);
        const order = orders.find(o => o.id === order_id);
        if (!order) {
          res.writeHead(404);
          return res.end("Order not found");
        }

        if (payment_status === "finished" || payment_status === "confirmed" || payment_status === "sending") {
          if (order.status === "COMPLETED") {
            return sendJson(res, 200, { ok: true });
          }

          const completedOrder = completeProductOrderInternal(order.id);
          if (completedOrder) {
            onOrderCompleted(completedOrder);
            logAuditAction(null, "ORDER_FULFILL_CRYPTO", `Completed order ${order.id} via Crypto payment confirmation (£${(order.total || 0).toFixed(2)})`);
          }
          return sendJson(res, 200, { ok: true, delivered: true });
        } else if (payment_status === "failed" || payment_status === "expired") {
          order.status = payment_status.toUpperCase();
          writeJson(ordersFile, orders);

          // Release reserved unique-card stock back to inventory on failure/expiry
          const allInventory = readItems();
          let updated = false;
          for (const item of order.items) {
            if (item.type === "stock") {
              const stockEntry = allInventory.find(inv => inv.id === item.id && inv.orderId === order.id);
              if (stockEntry && String(stockEntry.soldTo).startsWith("PENDING_")) {
                stockEntry.isSold = false;
                stockEntry.soldTo = null;
                stockEntry.orderId = null;
                updated = true;
              }
            }
          }
          if (updated) {
            writeItems(allInventory);
          }

          // Release reserved log-product stock too (units held for this pending order)
          const prodsRel = readProducts();
          let prodReleased = false;
          for (const p of prodsRel) {
            for (const v of (Array.isArray(p.variants) ? p.variants : [])) {
              for (const s of (v.stock || [])) {
                if (s.orderId === order.id && String(s.soldTo).startsWith("PENDING_")) {
                  s.isSold = false;
                  s.soldTo = null;
                  s.orderId = null;
                  prodReleased = true;
                }
              }
            }
          }
          if (prodReleased) writeProducts(prodsRel);
        }
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 200, { ok: true });
    }

    // Force Transaction Webhook Complete (Manual Admin Override for local testing without ngrok!)
    if (url.pathname === "/api/admin/payments/override" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { orderId } = body;
      if (!orderId) return sendJson(res, 400, { error: "Missing orderId." });

      // Trigger standard completed processing internally!
      if (orderId.startsWith("TOP-")) {
        const topups = readJson(topupsFile, []);
        const topup = topups.find(t => t.id === orderId);
        if (!topup) return sendJson(res, 404, { error: "Topup not found." });

        topup.status = "COMPLETED";
        writeJson(topupsFile, topups);

        const users = readJson(usersFile, []);
        const user = users.find(u => u.id === topup.userId);
        if (user) {
          const credit = Number((topup.creditAmount || topup.amount).toFixed(2));
          user.balance = Number((Number(user.balance || 0) + credit).toFixed(2));
          writeJson(usersFile, users);
        }

        logAuditAction(req, "TOPUP_FORCE_COMPLETE", `Force-completed topup transaction ${orderId} (£${topup.amount.toFixed(2)}) for user ${user ? user.email : 'N/A'}`);
        return sendJson(res, 200, { success: true, message: `Topup ${orderId} force-completed successfully.` });
      }

      if (orderId.startsWith("ORD-")) {
        const orders = readJson(ordersFile, []);
        const order = orders.find(o => o.id === orderId);
        if (!order) return sendJson(res, 404, { error: "Order not found." });

        const allInventory = readItems();
        const allProducts = readProducts();
        const deliveredItems = [];
        let pendingFulfillment = false;
        let hasCustomItems = false;

        for (const item of order.items) {
          if (item.type === "stock") {
            const stockEntry = allInventory.find(inv => inv.id === item.id && (inv.orderId === order.id || !inv.isSold));
            if (stockEntry) {
              stockEntry.isSold = true;
              stockEntry.soldTo = order.userId;
              stockEntry.orderId = order.id;
              deliveredItems.push({
                id: stockEntry.id,
                type: "stock",
                name: `${stockEntry.bin} ${stockEntry.type} ${stockEntry.level}`,
                price: stockEntry.price,
                refundable: stockEntry.refundable !== false,
                refundWindowHours: Number(stockEntry.refundWindowHours) > 0 ? Number(stockEntry.refundWindowHours) : 24,
                credentials: buildDeliveredCredentials(stockEntry)
              });
            }
          } else if (item.type === "custom-product") {
            hasCustomItems = true;
            deliveredItems.push(item);
          } else {
            const parts = String(item.id).split(":");
            const prod = allProducts.find(p => p.id === parts[0]);
            if (prod && prod.isManualDelivery) {
              hasCustomItems = true;
              item.type = "custom-product";
              item.credentials = "Awaiting manual delivery by administrator.";
              deliveredItems.push(item);
            } else {
              const allocated = allocateProductStock(item, order.userId, order.id);
              if (allocated) {
                deliveredItems.push({
                  id: item.id,
                  type: "log-product",
                  name: allocated.name,
                  price: allocated.price,
                  refundable: true,
                  refundWindowHours: LOG_PRODUCT_REFUND_WINDOW_HOURS,
                  credentials: allocated.credentials
                });
              } else {
                // Real stock unavailable — NEVER fabricate. Flag for manual fulfillment/refund.
                pendingFulfillment = true;
                deliveredItems.push({
                  id: item.id,
                  type: "log-product",
                  name: item.name,
                  price: item.price,
                  refundable: true,
                  refundWindowHours: LOG_PRODUCT_REFUND_WINDOW_HOURS,
                  credentials: "Awaiting restock — our team will deliver your item or refund you shortly. Please contact support with this order ID."
                });
              }
            }
          }
        }

        writeItems(allInventory);

        order.status = hasCustomItems ? "PROCESSING" : "COMPLETED";
        order.items = deliveredItems;
        if (pendingFulfillment) order.fulfillmentPending = true;
        writeJson(ordersFile, orders);

        onOrderCompleted(order);
        logAuditAction(req, "ORDER_FORCE_COMPLETE", `Force-completed order ${orderId} via administrator override (£${order.total.toFixed(2)})`);

        return sendJson(res, 200, { success: true, message: `Order ${orderId} force-completed${pendingFulfillment ? " (some items pending restock)" : " and credentials delivered"}.` });
      }
    }

    // Get order details for Telegram Stars Bot
    if (url.pathname === "/api/orders/details-stars" && req.method === "GET") {
      const orderId = url.searchParams.get("orderId");
      const secret = url.searchParams.get("secret");

      if (secret !== STARS_SECRET) {
        return sendJson(res, 403, { error: "Forbidden" });
      }

      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === orderId);
      if (!order) {
        return sendJson(res, 404, { error: "Order not found" });
      }

      const itemsDesc = order.items.map(item => `${item.quantity || 1}x ${item.name}`).join(", ");
      return sendJson(res, 200, {
        id: order.id,
        total: order.total,
        status: order.status,
        itemsDescription: itemsDesc
      });
    }

    // Complete Telegram Stars payment
    if (url.pathname === "/api/orders/complete-stars" && req.method === "POST") {
      const body = JSON.parse(await parseBody(req) || "{}");
      const { orderId, secret } = body;

      if (secret !== STARS_SECRET) {
        return sendJson(res, 403, { error: "Forbidden" });
      }

      const completedOrder = completeProductOrderInternal(orderId);
      if (!completedOrder) {
        return sendJson(res, 404, { error: "Order not found" });
      }

      return sendJson(res, 200, { success: true, order: completedOrder });
    }

    // Poll order status (called by storefront)
    if (url.pathname === "/api/orders/status" && req.method === "GET") {
      const session = getSession(req);
      if (!session) {
        return sendJson(res, 401, { error: "Login required." });
      }

      const orderId = url.searchParams.get("orderId");
      if (!orderId) {
        return sendJson(res, 400, { error: "Missing orderId" });
      }

      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === orderId);
      if (!order) {
        return sendJson(res, 404, { error: "Order not found" });
      }

      // Secure: Ensure users can only query their own orders
      if (session.user.role !== "ADMIN" && session.user.role !== "GOD" && order.userId !== session.userId) {
        return sendJson(res, 403, { error: "Forbidden: You do not own this order." });
      }

      return sendJson(res, 200, { status: order.status, items: order.items });
    }

    // Fetch stored NOWPayments invoice details by ID
    if (url.pathname.startsWith("/api/nowpayments/invoice/") && req.method === "GET") {
      const rawPath = String(url.pathname || url);
      const paymentId = rawPath.replace(/^\/api\/nowpayments\/invoice\//, "").split("?")[0].trim();
      if (!paymentId) return sendJson(res, 400, { error: "Payment ID required." });

      const orders = readJson(ordersFile, []);
      const topups = readJson(topupsFile, []);

      let order = orders.find(o => String(o.paymentId) === String(paymentId) || String(o.id) === String(paymentId) || (o.nowpayments && (String(o.nowpayments.payment_id) === String(paymentId) || String(o.nowpayments.order_id) === String(paymentId))));
      let topup = topups.find(t => String(t.paymentId) === String(paymentId) || String(t.id) === String(paymentId) || (t.nowpayments && (String(t.nowpayments.payment_id) === String(paymentId) || String(t.nowpayments.order_id) === String(paymentId))));

      if (!order && !topup) {
        return sendJson(res, 404, { error: "Invoice not found." });
      }

      const target = topup || order;
      const np = target.nowpayments || {
        payment_id: target.paymentId || target.id,
        order_id: target.id,
        pay_amount: target.payAmount || target.total || target.amount,
        pay_address: target.payAddress,
        coin: target.coin || "btc",
        network: target.network || "",
        created_at: target.createdAt
      };

      return sendJson(res, 200, {
        success: true,
        status: target.status,
        createdAt: target.createdAt,
        nowpayments: {
          ...np,
          status: target.status,
          created_at: np.created_at || target.createdAt
        }
      });
    }

    // Live NOWPayments Status Polling Endpoint (for orders & balance topups)
    if (url.pathname.startsWith("/api/nowpayments/status/") && req.method === "GET") {
      const rawPath = String(url.pathname || url);
      const paymentId = rawPath.replace(/^\/api\/nowpayments\/status\//, "").split("?")[0].trim();
      if (!paymentId) return sendJson(res, 400, { error: "Payment ID required." });

      const orders = readJson(ordersFile, []);
      const topups = readJson(topupsFile, []);

      let order = orders.find(o => String(o.paymentId) === String(paymentId) || String(o.id) === String(paymentId));
      let topup = topups.find(t => String(t.paymentId) === String(paymentId) || String(t.id) === String(paymentId));

      if (!order && !topup) {
        return sendJson(res, 404, { error: "Invoice/Topup not found." });
      }

      const isTopup = !!topup;
      const targetObj = topup || order;

      if (targetObj.status === "COMPLETED" || targetObj.status === "FINISHED") {
        return sendJson(res, 200, { isPaid: true, status: "completed", orderId: targetObj.id, isTopup });
      }

      // Check NOWPayments live API directly
      const apiKey = isTopup ? NOWPAYMENTS_TOPUP_API_KEY : NOWPAYMENTS_ORDER_API_KEY;
      try {
        const liveRes = await apiCall(`/payment/${encodeURIComponent(paymentId)}`, "GET", apiKey);
        if (liveRes && liveRes.payment_status) {
          const liveStatus = String(liveRes.payment_status).toLowerCase();

          if (liveStatus === "finished" || liveStatus === "confirmed" || liveStatus === "sending") {
            if (isTopup) {
              topup.status = "COMPLETED";
              topup.completedAt = new Date().toISOString();
              writeJson(topupsFile, topups);

              // Auto credit user balance
              const users = readJson(usersFile, []);
              const user = users.find(u => u.id === topup.userId);
              if (user) {
                const creditAmount = Number(topup.creditAmount || topup.amountUsd || topup.amount || 0);
                user.balance = Number(((user.balance || 0) + creditAmount).toFixed(2));
                writeJson(usersFile, users);
              }
            } else {
              completeProductOrderInternal(order.id);
            }
            return sendJson(res, 200, { isPaid: true, status: "completed", orderId: targetObj.id, isTopup });
          } else if (liveStatus === "confirming") {
            targetObj.status = "CONFIRMING";
            if (isTopup) writeJson(topupsFile, topups);
            else writeJson(ordersFile, orders);
            return sendJson(res, 200, { isPaid: false, status: "confirming", orderId: targetObj.id, isTopup });
          } else if (liveStatus === "partially_paid") {
            targetObj.status = "PARTIALLY_PAID";
            targetObj.actuallyPaid = liveRes.amount_received || 0;
            if (isTopup) writeJson(topupsFile, topups);
            else writeJson(ordersFile, orders);
            return sendJson(res, 200, { isPaid: false, status: "partially_paid", actuallyPaid: liveRes.amount_received, orderId: targetObj.id, isTopup });
          } else if (liveStatus === "expired" || liveStatus === "failed") {
            targetObj.status = "EXPIRED";
            if (isTopup) writeJson(topupsFile, topups);
            else writeJson(ordersFile, orders);
            return sendJson(res, 200, { isPaid: false, status: "expired", orderId: targetObj.id, isTopup });
          }
        }
        return sendJson(res, 200, { isPaid: false, status: liveRes ? liveRes.payment_status : (targetObj.status || "waiting"), isTopup });
      } catch (err) {
        return sendJson(res, 200, { isPaid: false, status: targetObj.status || "waiting", isTopup });
      }
    }

    // ── REPLACEMENT BOT API ──────────────────────────────────────────────
    // Fetch order for the replacement bot (secret-authenticated)
    if (url.pathname === "/api/bot/order" && req.method === "GET") {
      const secret = url.searchParams.get("secret");
      if (secret !== REPLACEMENT_SECRET) return sendJson(res, 403, { error: "Forbidden" });
      const orderId = url.searchParams.get("orderId");
      if (!orderId) return sendJson(res, 400, { error: "Missing orderId" });
      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === orderId);
      if (!order) return sendJson(res, 404, { error: "Order not found" });
      return sendJson(res, 200, { order });
    }

    // Auto-replace: find matching unsold stock and swap credentials
    if (url.pathname === "/api/bot/replace-item" && req.method === "POST") {
      const body = JSON.parse(await parseBody(req) || "{}");
      const { secret, orderId, itemIndex } = body;
      if (secret !== REPLACEMENT_SECRET) return sendJson(res, 403, { error: "Forbidden" });
      if (!orderId || itemIndex === undefined) return sendJson(res, 400, { error: "orderId and itemIndex required" });

      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === orderId);
      if (!order) return sendJson(res, 404, { error: "Order not found" });
      if (order.status !== "COMPLETED") return sendJson(res, 400, { error: "Order not completed" });

      const item = order.items[itemIndex];
      if (!item) return sendJson(res, 400, { error: "Invalid item index" });

      // Check refund window
      const refundable = item.refundable !== false;
      const windowHours = Number(item.refundWindowHours) > 0 ? Number(item.refundWindowHours) : 24;
      const deliveredAt = new Date(order.createdAt).getTime();
      const expiresAt = deliveredAt + windowHours * 3600 * 1000;
      if (!refundable) return sendJson(res, 400, { error: "This item is non-refundable." });
      if (Date.now() > expiresAt) return sendJson(res, 400, { error: "Replacement window has expired." });

      // Check if already replaced
      if (item.replaced) return sendJson(res, 400, { error: "This item has already been replaced." });

      const allInventory = readItems();

      if (item.type === "stock") {
        // Find the original sold stock entry by item.id
        const oldEntry = allInventory.find(inv => inv.id === item.id);
        if (!oldEntry) return sendJson(res, 400, { error: "Original stock entry not found." });

        // Find matching unsold replacement: same type + state
        const replacement = allInventory.find(inv =>
          !inv.isSold &&
          inv.id !== oldEntry.id &&
          inv.type === oldEntry.type &&
          inv.state === oldEntry.state
        );

        if (!replacement) return sendJson(res, 404, { error: "No matching replacement stock available. Balance refund issued instead.",  refundInstead: true, refundAmount: Number(item.price) });

        // Mark replacement as sold
        replacement.isSold = true;
        replacement.soldTo = order.userId;
        replacement.orderId = order.id;
        writeItems(allInventory);

        // Update order item with new credentials
        const oldCreds = item.credentials;
        item.credentials = buildDeliveredCredentials(replacement);
        item.replaced = true;
        item.replacedAt = new Date().toISOString();
        item.oldCredentials = oldCreds;
        item.replacementStockId = replacement.id;
        item.name = `${replacement.bin} ${replacement.type} ${replacement.level}`;
        writeJson(ordersFile, orders);

        return sendJson(res, 200, { success: true, newCredentials: item.credentials, newName: item.name });
      } else {
        // Log-product: find replacement from same product variant
        const parts = String(item.id).split(":");
        const allProds = readProducts();
        const prod = allProds.find(p => p.id === parts[0]);
        const variant = prod ? (prod.variants || []).find(v => v.id === parts[1]) : null;
        if (!variant) return sendJson(res, 404, { error: "No matching replacement stock available.", refundInstead: true, refundAmount: Number(item.price) });

        const unsold = (variant.stock || []).find(s => !s.isSold);
        if (!unsold) return sendJson(res, 404, { error: "No matching replacement stock available. Balance refund issued instead.", refundInstead: true, refundAmount: Number(item.price) });

        unsold.isSold = true;
        unsold.soldTo = order.userId;
        unsold.orderId = order.id;
        writeProducts(allProds);

        const oldCreds = item.credentials;
        item.credentials = unsold.content || unsold.credentials || "";
        item.replaced = true;
        item.replacedAt = new Date().toISOString();
        item.oldCredentials = oldCreds;
        writeJson(ordersFile, orders);

        return sendJson(res, 200, { success: true, newCredentials: item.credentials, newName: item.name });
      }
    }

    // Balance refund via bot (when no stock available)
    if (url.pathname === "/api/bot/refund-balance" && req.method === "POST") {
      const body = JSON.parse(await parseBody(req) || "{}");
      const { secret, userId, amount, orderId, itemIndex } = body;
      if (secret !== REPLACEMENT_SECRET) return sendJson(res, 403, { error: "Forbidden" });

      const users = readJson(usersFile, []);
      const user = users.find(u => u.id === userId);
      if (!user) return sendJson(res, 404, { error: "User not found" });

      user.balance = (user.balance || 0) + Number(amount);
      writeJson(usersFile, users);

      // Mark item as refunded in order
      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === orderId);
      if (order && order.items[itemIndex]) {
        order.items[itemIndex].replaced = true;
        order.items[itemIndex].replacedAt = new Date().toISOString();
        order.items[itemIndex].refundedToBalance = Number(amount);
        writeJson(ordersFile, orders);
      }

      return sendJson(res, 200, { success: true, newBalance: user.balance });
    }

    // SUPPORT TICKET ORDER LOOKUP
    if (url.pathname === "/api/tickets/lookup-order" && req.method === "GET") {
      const session = requireUser(req, res);
      if (!session) return;
      const orderId = url.searchParams.get("orderId");
      if (!orderId) return sendJson(res, 400, { error: "Order ID required." });

      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id.toUpperCase() === orderId.trim().toUpperCase());
      if (!order) return sendJson(res, 404, { error: "Order not found." });

      if (session.user.role !== "ADMIN" && session.user.role !== "GOD" && order.userId !== session.userId && order.email !== session.user.email) {
        return sendJson(res, 403, { error: "Forbidden: You do not own this order." });
      }

      return sendJson(res, 200, { ok: true, order: { id: order.id, total: order.total, createdAt: order.createdAt, items: order.items || [] } });
    }

    // CREATE NEW SUPPORT TICKET
    if (url.pathname === "/api/tickets/create" && req.method === "POST") {
      const session = requireUser(req, res);
      if (!session) return;

      const body = JSON.parse(await parseBody(req) || "{}");
      const { orderId, productName, variantName, issueReason, replacementCount, message } = body;

      if (!orderId || !productName || !message) {
        return sendJson(res, 400, { error: "Order ID, Product Name, and Message are required." });
      }

      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id.toUpperCase() === orderId.trim().toUpperCase());
      if (!order) return sendJson(res, 404, { error: "Order not found." });

      if (session.user.role !== "ADMIN" && session.user.role !== "GOD" && order.userId !== session.userId && order.email !== session.user.email) {
        return sendJson(res, 403, { error: "Forbidden: You do not own this order." });
      }

      const ticketId = `TCK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const newTicket = {
        id: ticketId,
        userId: session.userId,
        userEmail: session.user.email,
        orderId: order.id,
        productName: String(productName).trim(),
        variantName: String(variantName || "Standard").trim(),
        issueReason: String(issueReason || "Bad Credentials").trim(),
        replacementCount: parseInt(replacementCount) || 1,
        message: String(message).trim(),
        status: "PENDING",
        replacementCredentials: null,
        refundAmount: 0,
        messages: [
          { senderRole: "USER", message: String(message).trim(), createdAt: new Date().toISOString() }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const tickets = readJson(replacementsFile, []);
      tickets.unshift(newTicket);
      writeJson(replacementsFile, tickets);

      logAuditAction(req, "TICKET_CREATE", `User created support ticket ${ticketId} for Order ${order.id}`);
      return sendJson(res, 201, { success: true, ticket: newTicket });
    }

    // GET MY TICKETS
    if (url.pathname === "/api/tickets/my-tickets" && req.method === "GET") {
      const session = requireUser(req, res);
      if (!session) return;
      const tickets = readJson(replacementsFile, []).filter(t => t.userId === session.userId || t.userEmail === session.user.email);
      return sendJson(res, 200, { tickets });
    }

    // ADMIN TICKET ACTIONS (REFUND FULL, REFUND PARTIAL, REPLACE, DENY)
    if (url.pathname === "/api/admin/tickets/action" && req.method === "POST") {
      if (!requireAdminOrGod(req, res)) return;
      const body = JSON.parse(await parseBody(req) || "{}");
      const { ticketId, action, refundAmount, replacementText } = body;

      if (!ticketId || !action) return sendJson(res, 400, { error: "ticketId and action are required." });

      const tickets = readJson(replacementsFile, []);
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return sendJson(res, 404, { error: "Ticket not found." });

      const users = readJson(usersFile, []);
      const user = users.find(u => u.id === ticket.userId || u.email === ticket.userEmail);

      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === ticket.orderId);

      if (action === "REFUND_FULL") {
        const fullAmt = order ? Number(order.total || 0) : 0;
        if (user) {
          user.balance = Number((Number(user.balance || 0) + fullAmt).toFixed(2));
          writeJson(usersFile, users);
        }
        ticket.status = "REFUNDED";
        ticket.refundAmount = fullAmt;
        ticket.messages.push({
          senderRole: "REPLACE_ADMIN",
          message: `✓ Full refund of £${fullAmt.toFixed(2)} issued to user balance.`,
          createdAt: new Date().toISOString()
        });
      } else if (action === "REFUND_PARTIAL") {
        const partAmt = parseFloat(refundAmount) || 0;
        if (partAmt <= 0) return sendJson(res, 400, { error: "Invalid refund amount." });
        if (user) {
          user.balance = Number((Number(user.balance || 0) + partAmt).toFixed(2));
          writeJson(usersFile, users);
        }
        ticket.status = "REFUNDED";
        ticket.refundAmount = partAmt;
        ticket.messages.push({
          senderRole: "REPLACE_ADMIN",
          message: `✓ Partial refund of £${partAmt.toFixed(2)} issued to user balance.`,
          createdAt: new Date().toISOString()
        });
      } else if (action === "REPLACE") {
        if (!replacementText || !replacementText.trim()) {
          return sendJson(res, 400, { error: "Replacement stock text cannot be empty." });
        }
        ticket.status = "RESOLVED";
        ticket.replacementCredentials = replacementText.trim();
        
        if (order && Array.isArray(order.items)) {
          const matchedItem = order.items.find(i => i.name === ticket.productName) || order.items[0];
          if (matchedItem) {
            matchedItem.credentials = `[REPLACEMENT DELIVERED]:\n${replacementText.trim()}\n\n[Original]:\n${matchedItem.credentials || ''}`;
            writeJson(ordersFile, orders);
          }
        }

        ticket.messages.push({
          senderRole: "REPLACE_ADMIN",
          message: `✓ Replacement stock dispatched:\n${replacementText.trim()}`,
          createdAt: new Date().toISOString()
        });
      } else if (action === "DENY") {
        ticket.status = "DENIED";
        ticket.messages.push({
          senderRole: "REPLACE_ADMIN",
          message: `❌ Support ticket request denied by staff.`,
          createdAt: new Date().toISOString()
        });
      }

      ticket.updatedAt = new Date().toISOString();
      writeJson(replacementsFile, tickets);

      logAuditAction(req, "TICKET_ACTION", `Admin performed ${action} on ticket ID: ${ticketId}`);
      return sendJson(res, 200, { success: true, ticket });
    }

    // SUPPORT REPLACEMENTS TICKETING ENDPOINTS
    if (url.pathname === "/api/replacements" && req.method === "GET") {
      const session = requireUser(req, res);
      if (!session) return;
      const tickets = readJson(replacementsFile, []).filter(t => t.userId === session.userId);
      return sendJson(res, 200, { tickets });
    }

    if (url.pathname === "/api/replacements" && req.method === "POST") {
      const session = requireUser(req, res);
      if (!session) return;

      const body = JSON.parse(await parseBody(req) || "{}");
      const { orderId, stockLogIds, description, screenshots } = body;

      if (!orderId || !stockLogIds || !description) {
        return sendJson(res, 400, { error: "orderId, defective logs, and issue description are required." });
      }

      // Secure: Ensure the order exists and belongs to the logged-in user
      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === orderId);
      if (!order || order.userId !== session.userId) {
        return sendJson(res, 403, { error: "Forbidden: You do not own this order." });
      }

      // Save base64 screenshots inside screenshotsDir
      const savedFiles = [];
      const screenshotList = Array.isArray(screenshots) ? screenshots : [];
      
      for (const base64Data of screenshotList) {
        if (!base64Data.includes(";base64,")) continue;
        const [meta, data] = base64Data.split(";base64,");
        const ext = meta.split("/")[1] || "png";
        const filename = `replace_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
        fs.writeFileSync(path.join(screenshotsDir, filename), Buffer.from(data, "base64"));
        savedFiles.push(filename);
      }

      const ticketId = `REP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      
      const newTicket = {
        id: ticketId,
        userId: session.userId,
        userEmail: session.user.email,
        orderId,
        description,
        screenshots: savedFiles,
        stockLogIds: Array.isArray(stockLogIds) ? stockLogIds : [],
        status: "PENDING",
        messages: [
          { senderRole: "USER", message: description, createdAt: new Date().toISOString() }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const tickets = readJson(replacementsFile, []);
      tickets.unshift(newTicket);
      writeJson(replacementsFile, tickets);

      return sendJson(res, 201, { success: true, ticket: newTicket });
    }

    if (url.pathname.startsWith("/api/replacements/") && url.pathname.endsWith("/messages")) {
      const parts = url.pathname.split("/");
      const ticketId = parts[3];

      const session = requireUser(req, res);
      if (!session) return;

      const tickets = readJson(replacementsFile, []);
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return sendJson(res, 404, { error: "Ticket not found." });

      if (req.method === "GET") {
        if (session.user.role !== "ADMIN" && ticket.userId !== session.userId) {
          return sendJson(res, 403, { error: "Unauthorized access." });
        }
        return sendJson(res, 200, { messages: ticket.messages, status: ticket.status });
      }

      if (req.method === "POST") {
        const body = JSON.parse(await parseBody(req) || "{}");
        const { message } = body;
        if (!message || !message.trim()) return sendJson(res, 400, { error: "Message content cannot be blank." });

        const isUserAdmin = session.user.role === "ADMIN";
        
        ticket.messages.push({
          senderRole: isUserAdmin ? "REPLACE_ADMIN" : "USER",
          message: message.trim(),
          createdAt: new Date().toISOString()
        });
        ticket.updatedAt = new Date().toISOString();
        writeJson(replacementsFile, tickets);

        return sendJson(res, 200, { success: true, messages: ticket.messages });
      }
    }

    // ADMIN REPLACEMENTS ENDPOINTS
    if (url.pathname === "/api/admin/replacements/all" && req.method === "GET") {
      if (!requireAdminOrGod(req, res)) return;
      return sendJson(res, 200, { tickets: readJson(replacementsFile, []) });
    }

    if (url.pathname.startsWith("/api/admin/replacements/") && url.pathname.endsWith("/reply") && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const parts = url.pathname.split("/");
      const ticketId = parts[4];

      const body = JSON.parse(await parseBody(req) || "{}");
      const { message, replacementLogs } = body;
      
      if (!message || !message.trim()) return sendJson(res, 400, { error: "Message cannot be empty." });

      const tickets = readJson(replacementsFile, []);
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return sendJson(res, 404, { error: "Ticket not found." });

      const replyMsg = {
        senderRole: "REPLACE_ADMIN",
        message: message.trim(),
        createdAt: new Date().toISOString()
      };

      if (Array.isArray(replacementLogs) && replacementLogs.length > 0) {
        replyMsg.replacementLogs = replacementLogs;
        
        // Also update items content so the user knows they got replacements!
        const orders = readJson(ordersFile, []);
        const order = orders.find(o => o.id === ticket.orderId);
        if (order) {
          replacementLogs.forEach(rl => {
            const oldItem = order.items.find(item => item.id === rl.stockLogId);
            if (oldItem) {
              oldItem.credentials = `[REPLACED] Old: ${oldItem.credentials.substring(0, 30)}...\nNew Replacement: ${rl.content}`;
            }
          });
          writeJson(ordersFile, orders);
        }
      }

      ticket.messages.push(replyMsg);
      ticket.updatedAt = new Date().toISOString();
      writeJson(replacementsFile, tickets);

      logAuditAction(req, "TICKET_REPLY", `Staff replied to ticket ID: ${ticketId} (Order ID: ${ticket.orderId})`);
      return sendJson(res, 200, { success: true, ticket });
    }

    if (url.pathname.startsWith("/api/admin/replacements/") && url.pathname.endsWith("/status") && req.method === "PUT") {
      if (!requireAdmin(req, res)) return;
      const parts = url.pathname.split("/");
      const ticketId = parts[4];

      const body = JSON.parse(await parseBody(req) || "{}");
      const { status } = body;
      if (!["PENDING", "RESOLVED", "DISMISSED"].includes(status)) {
        return sendJson(res, 400, { error: "Invalid ticket status." });
      }

      const tickets = readJson(replacementsFile, []);
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return sendJson(res, 404, { error: "Ticket not found." });

      ticket.status = status;
      ticket.updatedAt = new Date().toISOString();
      writeJson(replacementsFile, tickets);

      logAuditAction(req, "TICKET_STATUS", `Changed status of ticket ID: ${ticketId} to ${status}`);
      return sendJson(res, 200, { success: true, ticket });
    }

    // Auto-search next available unsold card row matching defective row (BIN / Type / State / price)
    if (url.pathname.startsWith("/api/admin/replacements/") && url.pathname.endsWith("/next-stock") && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      const parts = url.pathname.split("/");
      const ticketId = parts[4];

      const tickets = readJson(replacementsFile, []);
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return sendJson(res, 404, { error: "Ticket not found." });

      // Find defective logs details from inventory.json using IDs
      const allInventory = readItems();
      const nextStockList = [];

      for (const defectiveId of ticket.stockLogIds) {
        const defectiveEntry = allInventory.find(inv => inv.id === defectiveId);
        if (!defectiveEntry) continue;

        // Auto find next unsold card entry with identical Type and State!
        const nextStockEntry = allInventory.find(inv => 
          !inv.isSold && 
          inv.type === defectiveEntry.type && 
          inv.state === defectiveEntry.state &&
          inv.id !== defectiveId
        );

        if (nextStockEntry) {
          nextStockList.push({
            defectiveStockLogId: defectiveId,
            defectiveStockContent: `${defectiveEntry.bin} | ${defectiveEntry.type} | ${defectiveEntry.level}`,
            nextStockLogId: nextStockEntry.id,
            nextStockContent: `${nextStockEntry.bin} | ${nextStockEntry.type} | ${nextStockEntry.level} | ${nextStockEntry.issuer} | ${nextStockEntry.state} | ${nextStockEntry.zip} | ${nextStockEntry.country} | ${nextStockEntry.base} | ${nextStockEntry.billing} | ${nextStockEntry.price} | ${nextStockEntry.city}`
          });
        }
      }

      return sendJson(res, 200, { nextStockList });
    }

    // PUBLIC FILE SERVING — strict allowlist
    // Only files explicitly listed below can ever be served.
    // server.js, package.json, data/*, node_modules/*, and anything else → 404.

    // Canonical clean URLs: /foo.html → /foo
    if (url.pathname.endsWith(".html")) {
      const clean = url.pathname.slice(0, -5);
      const target = clean === "/index" ? "/" : clean;
      return redirect(res, target + (url.search || ""));
    }

    // Map clean URLs to .html files
    let requestedPath;
    if (url.pathname === "/") {
      requestedPath = "/index.html";
    } else if (!path.extname(url.pathname) && !url.pathname.startsWith("/screenshots/") && !url.pathname.startsWith("/uploads/")) {
      requestedPath = url.pathname + ".html";
    } else {
      requestedPath = url.pathname;
    }

    // Uploads — served publicly
    if (requestedPath.startsWith("/uploads/")) {
      const safeFile = path.join(uploadsDir, path.basename(requestedPath));
      return fs.readFile(safeFile, (err, data) => {
        if (err) { res.writeHead(404); return res.end("Not found"); }
        res.writeHead(200, {
          "Content-Type": contentTypes[path.extname(safeFile)] || "application/octet-stream",
          "Cache-Control": "public, max-age=86400"
        });
        res.end(data);
      });
    }

    // Screenshots — admin only, path.basename prevents any traversal
    if (requestedPath.startsWith("/screenshots/")) {
      const screenshotSession = getSession(req);
      if (!screenshotSession || screenshotSession.user.role !== "ADMIN") {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      const safeFile = path.join(screenshotsDir, path.basename(requestedPath));
      return fs.readFile(safeFile, (err, data) => {
        if (err) { res.writeHead(404); return res.end("Not found"); }
        res.writeHead(200, {
          "Content-Type": contentTypes[path.extname(safeFile)] || "application/octet-stream",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        });
        res.end(data);
      });
    }

    // Static Crypto & Payment Icons
    if (requestedPath.startsWith("/icons/")) {
      const iconFile = path.join(__dirname, "icons", path.basename(requestedPath));
      if (fs.existsSync(iconFile)) {
        return fs.readFile(iconFile, (err, data) => {
          if (err) { res.writeHead(404); return res.end("Not found"); }
          res.writeHead(200, {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "no-cache, no-store, must-revalidate"
          });
          return res.end(data);
        });
      }
    }

    // Strict allowlist — anything not listed here is a hard 404
    // Public: accessible without a session (only login page & essential assets to render it)
    const PUBLIC_FILES  = new Set([
      "/login.html", "/login.js", "/styles.css", "/cart-utils.js",
      "/banner.png", "/logo.png", "/hero-logo.png", "/login-logo.png",
      "/favicon.svg", "/favicon.ico", "/favicon.png", "/chime_logo.png"
    ]);
    // Auth: requires valid logged-in session for access to any page or code on the platform
    const AUTH_FILES    = new Set([
      "/", "/index.html", "/main.js", "/logs.html", "/logs.js",
      "/cart.html", "/cart.js", "/pay.html",
      "/orders.html", "/balance.html", "/balance.js",
      "/dashboard.html", "/dashboard.js", "/deposit.html", "/deposit.js",
      "/support.html", "/support.js",
      "/faq.html", "/faq.js", "/tos.html", "/tos.js", "/privacy.html", "/privacy.js"
    ]);
    // Admin: requires ADMIN role
    const ADMIN_FILES   = new Set(["/admin.html", "/admin.js", "/god.html", "/god.js"]);

    const inPublic = PUBLIC_FILES.has(requestedPath);
    const inAuth   = AUTH_FILES.has(requestedPath);
    const inAdmin  = ADMIN_FILES.has(requestedPath);

    if (!inPublic && !inAuth && !inAdmin) {
      // Not on the allowlist — return 404 (not 403, to avoid confirming the file exists)
      res.writeHead(404);
      return res.end("Not found");
    }

    const fileSession = getSession(req);

    if (inAdmin) {
      if (!fileSession) return redirect(res, "/login?redirect=/admin");
      if (fileSession.user.role !== "ADMIN" && fileSession.user.role !== "GOD") return redirect(res, "/");
    } else if (inAuth) {
      if (!fileSession) {
        const cleanPath = requestedPath.endsWith(".html") ? requestedPath.slice(0, -5) : requestedPath;
        const redir = (cleanPath === "/index" || cleanPath === "/" || cleanPath === "") ? "" : `?redirect=${encodeURIComponent(cleanPath)}`;
        return redirect(res, `/login${redir}`);
      }
    }

    // Already logged in → redirect away from login
    if (requestedPath === "/login.html" && fileSession) {
      const role = fileSession.user.role;
      if (role === "ADMIN") return redirect(res, "/admin");
      if (role === "GOD")   return redirect(res, "/god");
      return redirect(res, "/");
    }

    const filePath = path.join(root, requestedPath);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }

      const ext = path.extname(filePath);
      const mime = contentTypes[ext] || "application/octet-stream";

      // Smart caching: static assets get cached, HTML and admin assets stay fresh
      const isHtml = ext === ".html";
      const isAdminAsset = requestedPath.includes("admin") || requestedPath.includes("styles.css");
      const isStaticAsset = [".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"].includes(ext);
      const cacheHeader = (isHtml || isAdminAsset)
        ? "no-cache, no-store, must-revalidate"
        : isStaticAsset ? "public, max-age=3600, stale-while-revalidate=86400" : "no-store";

      // Gzip compress text-based responses
      const isCompressible = [".html", ".css", ".js", ".json", ".svg"].includes(ext);
      const acceptEncoding = String(req.headers["accept-encoding"] || "");

      const headers = {
        "Content-Type": mime,
        "Cache-Control": cacheHeader,
        "X-Content-Type-Options": "nosniff"
      };

      if (isCompressible && acceptEncoding.includes("gzip")) {
        headers["Content-Encoding"] = "gzip";
        headers["Vary"] = "Accept-Encoding";
        zlib.gzip(data, (gzErr, compressed) => {
          if (gzErr) {
            res.writeHead(200, headers);
            return res.end(data);
          }
          res.writeHead(200, headers);
          res.end(compressed);
        });
      } else {
        res.writeHead(200, headers);
        res.end(data);
      }
    });
  } catch (error) {
    console.error(error);
    sendJson(res, 400, { error: error.message });
  }
});

const port = Number(process.env.PORT) || 3001;
syncSystemAccounts(); // Enforce secure credentials on every start
server.listen(port, () => {
  console.log(`Falcon Logs production backend listening at http://localhost:${port}`);
  // Register Telegram webhook (idempotent — fine to re-run on every start)
  telegramApi("setWebhook", { url: `${PUBLIC_BASE_URL}/api/telegram/webhook` })
    .then(r => console.log("[Telegram setWebhook]", r && r.ok ? "OK" : JSON.stringify(r)))
    .catch(e => console.warn("[Telegram setWebhook failed]", e));

  // Restock bot uses getUpdates polling (separate bot, no webhook) to keep the
  // list of channels it belongs to current. Poll at startup then every 60s.
  pollRestockUpdates();
  setInterval(pollRestockUpdates, 60 * 1000);

  // Expire stale crypto invoices (1h) and release their reserved stock. Sweep every 60s.
  expireStalePayments();
  setInterval(expireStalePayments, 60 * 1000);
});

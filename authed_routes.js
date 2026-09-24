// =========================================================================
// Falcon Logs — 1:1 authed.cc API & Route Integration System
// =========================================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function createAuthedSystem(deps) {
  const {
    root,
    dataDir,
    usersFile,
    sessionsFile,
    ordersFile,
    topupsFile,
    couponsFile,
    categoriesFile,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    GOD_EMAIL,
    GOD_PASSWORD,
    readJson,
    writeJson,
    readProducts,
    readItems,
    writeItems,
    getSession,
    hashPassword,
    verifyPassword,
    sendJson,
    redirect,
    parseBody,
    createNowpaymentPayment,
    allocateProductStock,
    paymentExpiryTime,
    onOrderCompleted,
    replacementsFile: depReplacementsFile,
    vouchesFile: depVouchesFile
  } = deps;

  const cartsFile = path.join(dataDir, "carts.json");
  const replacementsFile = depReplacementsFile || path.join(dataDir, "replacements.json");
  const ticketsFile = replacementsFile;
  const vouchesFile = depVouchesFile || path.join(dataDir, "vouches.json");
  const uploadsDir = path.join(root, "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const globalVouchDrafts = new Map();

  function readCarts() {
    return readJson(cartsFile, {});
  }

  function writeCarts(carts) {
    writeJson(cartsFile, carts);
  }

  function parseRequestBody(raw) {
    if (!raw) return {};
    const trimmed = String(raw).trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { return JSON.parse(trimmed); } catch {}
    }
    const params = new URLSearchParams(trimmed);
    const obj = {};
    for (const [k, v] of params.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  function getUserCartKey(req, session) {
    if (session && session.userId) return `user_${session.userId}`;
    const cookieHeader = req.headers.cookie || "";
    const m = cookieHeader.match(/market_session=([^;]+)/);
    if (m && m[1]) return `token_${m[1]}`;
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "guest").split(",")[0].trim();
    return `guest_${ip}`;
  }

  // 1:1 Navbar Templates
  function getNavbarHtml(user, currentPath) {
    const isHome = currentPath === "/" || currentPath === "/products" || currentPath === "/index.html";
    const isOrders = currentPath === "/dashboard/orders" || currentPath === "/orders" || currentPath === "/orders.html";
    const isSupport = currentPath === "/support" || currentPath === "/support.html";
    const isVouches = currentPath === "/vouches" || currentPath === "/vouches.html";
    const isCart = currentPath === "/cart" || currentPath === "/cart.html";
    const isBalance = currentPath === "/balance" || currentPath === "/deposit" || currentPath === "/balance.html";

    if (user) {
      const balanceVal = Number(user.balance || 0).toFixed(2);
      const displayName = user.username || user.name || user.email.split("@")[0] || "Account";
      return `
<nav class="navbar navbar-expand-lg navbar-dark rounded-2 p-2">
  <a class="navbar-brand" href="/">
    <img src="/logo.png?v=1003" alt="Falcon Logs">
  </a>
  <button class="navbar-toggler" data-bs-target="#headerCollapse" data-bs-toggle="collapse" type="button" aria-label="Menu">
    <span class="navbar-toggler-icon"></span>
  </button>
  <div class="collapse navbar-collapse" id="headerCollapse">
    <!-- Desktop Header (>= 992px) -->
    <div class="d-none d-lg-flex w-100 align-items-center">
      <ul class="navbar-nav align-items-center">
        <li class="nav-item"><a class="nav-link ${isHome ? 'active' : ''}" href="/products">Home</a></li>
        <li class="nav-item"><a class="nav-link ${isOrders ? 'active' : ''}" href="/dashboard/orders">Orders</a></li>
        <li class="nav-item"><a class="nav-link ${isSupport ? 'active' : ''}" href="/support">Support</a></li>
        <li class="nav-item"><a class="nav-link ${isVouches ? 'active' : ''}" href="/vouches">Vouches</a></li>
      </ul>
      <ul class="navbar-nav ms-auto align-items-center">
        <li class="nav-item nav-item-balance">
          <a class="nav-link nav-balance-link ${isBalance ? 'active' : ''}" href="/balance">Balance | <span id="clientBalance">£${balanceVal}</span></a>
        </li>
        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle" data-bs-toggle="dropdown" href="javascript:void(0)" role="button">My Account</a>
          <ul class="dropdown-menu dropdown-menu-end account-dropdown">
            <li class="account-dropdown-header"><div class="acct-greet">Signed in as</div><div class="acct-name">${escapeHtml(displayName)}</div></li>
            <li>
              <a class="dropdown-item" href="/dashboard/change-email">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <span>Change Email</span>
              </a>
            </li>
            <li>
              <a class="dropdown-item" href="/dashboard/change-password">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>Change Password</span>
              </a>
            </li>
            <li><hr class="dropdown-divider"></li>
            <li>
              <a class="dropdown-item dropdown-item-danger" href="/auth/logout">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                <span>Logout</span>
              </a>
            </li>
          </ul>
        </li>
        <li class="nav-item">
          <a class="nav-link position-relative cart-count ${isCart ? 'active' : ''}" href="/cart">
            <svg height="24" viewBox="0 -960 960 960" width="24" xmlns="http://www.w3.org/2000/svg">
              <path d="M274.272-95.384q-30.272 0-51.118-20.882-20.847-20.882-20.847-51.154 0-30.272 20.882-51.118 20.882-20.847 51.154-20.847 30.272 0 51.119 20.882 20.846 20.846 20.846 51.154 0 30.272-20.882 51.118-20.881 20.847-51.154 20.847Zm399.385 0q-30.272 0-51.119-20.882-20.846-20.882-20.846-51.154 0-30.272 20.882-51.118 20.881-20.847 51.154-20.847 30.272 0 51.118 20.882 20.847 20.882 20.847 51.154 0 30.272-20.882 51.118-20.882 20.847-51.154 20.847ZM231.231-742 334-527.385h271.385q6.923 0 12.307-3.461 5.385-3.462 9.231-9.615l98.615-180.001q4.616-8.461.77-14.999Q722.462-742 713.231-742h-482Zm-31.539-66h574.77q25.587 0 38.486 21.269 12.898 21.269.129 43.808L678.769-500.615q-9.692 17.615-27.026 28.423t-38.051 10.808H316l-36.615 65.23q-6.154 9.231-.385 20t17.308 10.769h418.384q13.539 0 23.27 9.731t9.731 23.269q0 13.539-9.731 23.27t-23.27 9.731H274.308q-43 0-62.731-36.5-19.731-36.501-.346-72.27l56.153-103.231L120.307-822H75q-13.539 0-23.27-9.731Q42-841.461 42-855q0-13.539 9.73-23.269Q61.462-888 75-888h57.308q13.128 0 24.153 6.672 11.026 6.672 16.924 18.713L199.692-808ZM334-527.385h286-286Z" fill="currentColor"></path>
            </svg>
            <span id="cartItemsCount" class="cartItemsCount">0</span>
          </a>
        </li>
      </ul>
    </div>

    <!-- Mobile Navigation (< 992px) matching authed.cc 1:1 -->
    <div class="d-flex d-lg-none flex-column align-items-center mobile-nav-container w-100">
      <div class="mobile-pill-stack">
        <!-- 1. HOME -->
        <a class="mobile-pill-btn mobile-pill-home ${isHome ? 'active' : ''}" href="/products">HOME</a>

        <!-- 2. VOUCHES -->
        <a class="mobile-pill-btn ${isVouches ? 'active' : ''}" href="/vouches">VOUCHES</a>

        <!-- 3. SUPPORT -->
        <a class="mobile-pill-btn ${isSupport ? 'active' : ''}" href="/support">SUPPORT</a>

        <!-- 4. COMMUNITY with Telegram Icon Badge -->
        <a class="mobile-pill-btn mobile-pill-community" href="https://t.me/FalconLogsGatewayBot" target="_blank" rel="noopener">
          <span>COMMUNITY</span>
          <span class="tg-circle-badge">
            <svg viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
            </svg>
          </span>
        </a>

        <!-- 5. DASHBOARD Dropdown -->
        <div class="mobile-dashboard-wrapper">
          <button class="mobile-pill-btn mobile-dashboard-btn" type="button" data-bs-toggle="collapse" data-bs-target="#mobileDashboardCard" aria-expanded="false" aria-controls="mobileDashboardCard">
            <span>DASHBOARD</span> <span class="dashboard-chevron">▾</span>
          </button>
          <div class="collapse mobile-dashboard-card" id="mobileDashboardCard">
            <a class="mobile-dashboard-link" href="/dashboard/orders">ORDERS</a>
            <a class="mobile-dashboard-link" href="/dashboard/change-password">SETTING</a>
            <a class="mobile-dashboard-link" href="/balance">BALANCE | £<span class="clientBalanceMobile">${balanceVal}</span></a>
            <a class="mobile-dashboard-link mobile-dashboard-logout" href="/auth/logout">LOGOUT</a>
          </div>
        </div>

        <!-- 6. Cart Icon at Bottom -->
        <div class="mobile-cart-item">
          <a class="mobile-cart-link" href="/cart" aria-label="Cart">
            <span class="mobile-cart-count cartItemsCount">0</span>
            <svg height="28" viewBox="0 -960 960 960" width="28">
              <path d="M280-80q-33 0-56.5-23.5T200-160q0-33 23.5-56.5T280-240q33 0 56.5 23.5T360-160q0 33-23.5 56.5T280-80Zm400 0q-33 0-56.5-23.5T600-160q0-33 23.5-56.5T680-240q33 0 56.5 23.5T760-160q0 33-23.5 56.5T680-80ZM246-720l96 200h280l110-200H246Zm-38-80h590q23 0 35 20.5t1 41.5L710-496q-11 20-29.5 32T640-452H324l-44 80h480v80H280q-45 0-68-39.5t-2-78.5l54-98-144-304H40v-80h130l38 72Z"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  </div>
</nav>`;
    } else {
      return `
<nav class="navbar navbar-expand-lg navbar-dark rounded-2 p-2">
  <a class="navbar-brand" href="/">
    <img src="/logo.png?v=1003" alt="Falcon Logs">
  </a>
  <button class="navbar-toggler" data-bs-target="#headerCollapse" data-bs-toggle="collapse" type="button" aria-label="Menu">
    <span class="navbar-toggler-icon"></span>
  </button>
  <div class="collapse navbar-collapse" id="headerCollapse">
    <div class="d-none d-lg-flex w-100 align-items-center">
      <ul class="navbar-nav align-items-center">
        <li class="nav-item"><a class="nav-link ${isHome ? 'active' : ''}" href="/products">Home</a></li>
      </ul>
      <ul class="navbar-nav ms-auto navbar-auth-actions">
        <li class="nav-item"><a class="nav-link btn btn-primary" href="/auth/login">login</a></li>
        <li class="nav-item navbar-auth-or-wrap"><span class="navbar-auth-or text-white">or</span></li>
        <li class="nav-item"><a class="nav-link btn btn-gradient" href="/auth/signup">create account</a></li>
      </ul>
    </div>
    <div class="d-flex d-lg-none flex-column align-items-center mobile-nav-container w-100">
      <div class="mobile-pill-stack">
        <a class="mobile-pill-btn mobile-pill-home ${isHome ? 'active' : ''}" href="/products">HOME</a>
        <a class="mobile-pill-btn" href="/auth/login">LOGIN</a>
        <a class="mobile-pill-btn" href="/auth/signup">CREATE ACCOUNT</a>
      </div>
    </div>
  </div>
</nav>`;
    }
  }

  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function injectDynamicPageElements(htmlStr, user, currentPath) {
    let out = htmlStr;

    const isLogged = Boolean(user);
    const scriptInject = `<script>window.IS_LOGGED_IN = ${isLogged};</script>`;
    if (out.includes("<head>")) {
      out = out.replace("<head>", `<head>
  ${scriptInject}`);
    } else {
      out = scriptInject + out;
    }

    const navHtml = getNavbarHtml(user, currentPath);
    out = out.replace(/<nav class="navbar navbar-expand-lg.*?<\/nav>/s, navHtml);

    return out;
  }

  async function handleAuthedApi(req, res, url) {
    const session = getSession(req);
    const users = readJson(usersFile, []);
    const currentUser = session ? (users.find(u => u.id === session.userId) || session.user) : null;

    // ── AUTH HANDLERS ────────────────────────────────────────────────────────
    if ((url.pathname === "/auth/login" || url.pathname === "/api/auth/login") && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!email || !password) {
        if (url.pathname.startsWith("/api/")) return sendJson(res, 400, { error: "Email and password required." });
        return redirect(res, "/auth/login?error=Email%20and%20password%20required");
      }

      if (email === ADMIN_EMAIL.toLowerCase() || email === GOD_EMAIL.toLowerCase()) {
        const expected = email === GOD_EMAIL.toLowerCase() ? GOD_PASSWORD : ADMIN_PASSWORD;
        if (password !== expected) {
          if (url.pathname.startsWith("/api/")) return sendJson(res, 401, { error: "Invalid admin password." });
          return redirect(res, "/auth/login?error=Invalid%20credentials");
        }
      }

      let user = users.find(u => u.email.toLowerCase() === email);
      if (!user) {
        const username = email.split("@")[0] || "User";
        user = {
          id: crypto.randomUUID(),
          name: username,
          username: username,
          email: email,
          passwordHash: hashPassword(password),
          role: "USER",
          balance: 0,
          createdAt: new Date().toISOString()
        };
        users.push(user);
        writeJson(usersFile, users);
      }

      const token = crypto.randomBytes(32).toString("hex");
      const sessions = readJson(sessionsFile, []).filter(item => Date.now() < item.expiresAt);
      sessions.push({ token, userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
      writeJson(sessionsFile, sessions);

      const defaultRedirect = (user.role === "ADMIN") ? "/admin" : (user.role === "GOD" ? "/god" : "/products");
      const nextUrl = url.searchParams.get("next") || body.next || defaultRedirect;
      if (url.pathname.startsWith("/api/")) {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": `market_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
        });
        return res.end(JSON.stringify({ success: true, role: user.role, email: user.email, name: user.name || user.username }));
      }
      res.writeHead(302, {
        "Location": nextUrl,
        "Set-Cookie": `market_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
      });
      return res.end();
    }

    if ((url.pathname === "/auth/signup" || url.pathname === "/api/auth/signup") && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const email = String(body.email || "").trim().toLowerCase();
      const username = String(body.username || email.split("@")[0] || "User").trim();
      const password = String(body.password || "");

      if (!email || !password) {
        if (url.pathname.startsWith("/api/")) return sendJson(res, 400, { error: "Email and password required." });
        return redirect(res, "/auth/signup?error=Email%20and%20password%20required");
      }

      let user = users.find(u => u.email.toLowerCase() === email);
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          name: username,
          username: username,
          email: email,
          passwordHash: hashPassword(password),
          role: "USER",
          balance: 0,
          createdAt: new Date().toISOString()
        };
        users.push(user);
        writeJson(usersFile, users);
      }

      const token = crypto.randomBytes(32).toString("hex");
      const sessions = readJson(sessionsFile, []).filter(item => Date.now() < item.expiresAt);
      sessions.push({ token, userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
      writeJson(sessionsFile, sessions);

      if (url.pathname.startsWith("/api/")) {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": `market_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
        });
        return res.end(JSON.stringify({ success: true, role: user.role, email: user.email, name: user.name || user.username }));
      }
      const nextUrl = url.searchParams.get("next") || body.next || "/products";
      res.writeHead(302, {
        "Location": nextUrl,
        "Set-Cookie": `market_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
      });
      return res.end();
    }

    if ((url.pathname === "/auth/logout" || url.pathname === "/logout" || url.pathname === "/api/auth/logout") && (req.method === "GET" || req.method === "POST")) {
      const cookieHeader = req.headers.cookie || "";
      const m = cookieHeader.match(/market_session=([^;]+)/);
      if (m && m[1]) {
        writeJson(sessionsFile, readJson(sessionsFile, []).filter(item => item.token !== m[1]));
      }
      if (url.pathname.startsWith("/api/")) {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": "market_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
        });
        return res.end(JSON.stringify({ ok: true }));
      }
      res.writeHead(302, {
        "Location": "/products",
        "Set-Cookie": "market_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
      });
      return res.end();
    }

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      if (!session) return sendJson(res, 200, { authenticated: false });
      const users = readJson(usersFile, []);
      const user = users.find(u => u.id === session.userId || (session.user && u.id === session.user.id)) || session.user;
      if (!user) return sendJson(res, 200, { authenticated: false });
      return sendJson(res, 200, {
        authenticated: true,
        id: user.id,
        name: user.name || user.username || "",
        email: user.email,
        role: user.role,
        balance: Number(user.balance || 0),
        user: {
          id: user.id,
          name: user.name || user.username || "",
          email: user.email,
          role: user.role,
          balance: Number(user.balance || 0)
        }
      });
    }

    // ── CART APIS ─────────────────────────────────────────────────────────────
    if (url.pathname === "/api/cart" && req.method === "GET") {
      const cartKey = getUserCartKey(req, session);
      const allCarts = readCarts();
      const items = allCarts[cartKey] || [];
      return sendJson(res, 200, { items });
    }

    if ((url.pathname === "/api/cart/add" || url.pathname === "/api/cart") && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const cartKey = getUserCartKey(req, session);
      const productId = String(body.productId || body.product_id || "");
      const optionId = String(body.optionId || body.option_id || "");
      const quantity = Math.max(1, parseInt(body.quantity, 10) || 1);
      const stockFileId = body.stockFileId || body.stock_file_id || null;

      const allProds = readProducts();
      const prod = allProds.find(p => p.id === productId);
      if (!prod) return sendJson(res, 404, { error: "Product not found" });

      const variants = Array.isArray(prod.variants) ? prod.variants : [];
      let variant = variants.find(v => v.id === optionId);
      if (!variant && variants.length > 0) variant = variants[0];
      if (!variant) return sendJson(res, 400, { error: "Product option not found" });

      const allCarts = readCarts();
      const cart = allCarts[cartKey] || [];

      const existing = cart.find(item => item.option_id === variant.id && (!stockFileId || item.stock_file_id === stockFileId));
      if (existing) {
        existing.quantity += quantity;
      } else {
        cart.push({
          product_id: prod.id,
          product_title: prod.title,
          option_id: variant.id,
          option_name: variant.name || "Default",
          price: Number(variant.price) || 0,
          quantity: quantity,
          image_url: prod.image || prod.imageUrl || "",
          stock_file_id: stockFileId,
          productId: prod.id,
          variantId: variant.id,
          type: "log-product"
        });
      }

      allCarts[cartKey] = cart;
      writeCarts(allCarts);

      const totalCount = cart.reduce((s, i) => s + i.quantity, 0);
      return sendJson(res, 200, { success: true, cartCount: totalCount });
    }

    if (url.pathname.startsWith("/api/cart/") && req.method === "DELETE") {
      const cartKey = getUserCartKey(req, session);
      const rawKey = decodeURIComponent(url.pathname.replace(/^\/api\/cart\//, "")).trim();
      const allCarts = readCarts();
      let cart = allCarts[cartKey] || [];
      cart = cart.filter(i => {
        const itemKey = i.stock_file_id ? `${i.option_id}:${i.stock_file_id}` : i.option_id;
        return itemKey !== rawKey && i.option_id !== rawKey && i.product_id !== rawKey;
      });
      allCarts[cartKey] = cart;
      writeCarts(allCarts);
      const totalCount = cart.reduce((s, i) => s + i.quantity, 0);
      return sendJson(res, 200, { success: true, count: totalCount });
    }

    if (url.pathname === "/api/cart/count" && req.method === "GET") {
      const cartKey = getUserCartKey(req, session);
      const allCarts = readCarts();
      const cart = allCarts[cartKey] || [];
      const count = cart.reduce((s, i) => s + i.quantity, 0);
      return sendJson(res, 200, { count });
    }

    // ── COUPONS ───────────────────────────────────────────────────────────────
    if (url.pathname === "/api/coupons/apply" && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const code = String(body.code || "").trim().toUpperCase();
      const subtotal = parseFloat(body.subtotal) || 0;
      const coupons = readJson(couponsFile, []);
      const coupon = coupons.find(c => c.code.toUpperCase() === code && c.isActive);
      if (!coupon) return sendJson(res, 404, { error: "Invalid coupon code" });

      const now = Date.now();
      if (coupon.expiresAt && now > Date.parse(coupon.expiresAt)) {
        return sendJson(res, 400, { error: "Coupon has expired" });
      }

      let discount = 0;
      if (coupon.discountType === "PERCENT") {
        discount = Number((subtotal * (coupon.discountValue / 100)).toFixed(2));
      } else {
        discount = Math.min(Number(coupon.discountValue), subtotal);
      }
      return sendJson(res, 200, { success: true, discount, couponCode: coupon.code });
    }

    // ── OXAPAY CURRENCIES ─────────────────────────────────────────────────────
    if (url.pathname === "/api/oxapay/currencies" && req.method === "GET") {
      return sendJson(res, 200, {
        currencies: [
          { currency: "BTC", network: "Bitcoin", label: "Bitcoin (BTC)" },
          { currency: "ETH", network: "Ethereum", label: "Ethereum (ETH)" },
          { currency: "USDT", network: "TRC20", label: "USDT (TRC20)" },
          { currency: "USDT", network: "ERC20", label: "USDT (ERC20)" },
          { currency: "USDC", network: "ERC20", label: "USDC (ERC20)" },
          { currency: "BNB", network: "BSC", label: "BNB (BSC)" },
          { currency: "LTC", network: "Litecoin", label: "Litecoin (LTC)" },
          { currency: "SOL", network: "Solana", label: "Solana (SOL)" },
          { currency: "TRX", network: "Tron", label: "TRON (TRX)" },
          { currency: "XRP", network: "Ripple", label: "XRP" }
        ]
      });
    }

    // ── NOTIFICATIONS UNREAD ──────────────────────────────────────────────────
    if (url.pathname === "/api/notifications/unread-count" && req.method === "GET") {
      return sendJson(res, 200, { count: 0 });
    }

    // ── ORDERS PURCHASE (Cart Checkout) ──────────────────────────────────────
    if (url.pathname === "/api/orders/purchase" && req.method === "POST") {
      if (!session) return sendJson(res, 401, { error: "Please sign in to complete your purchase." });
      const cartKey = getUserCartKey(req, session);
      const allCarts = readCarts();
      const cart = allCarts[cartKey] || [];
      if (!cart.length) return sendJson(res, 400, { error: "Your cart is empty." });

      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const paymentMethod = String(body.paymentMethod || "balance").toLowerCase();
      const couponCode = body.couponCode || null;

      const allProducts = readProducts();
      let subtotal = 0;
      for (const item of cart) {
        const prod = allProducts.find(p => p.id === item.product_id || p.id === item.productId);
        const variant = prod ? (prod.variants || []).find(v => v.id === item.option_id || v.id === item.variantId) : null;
        const price = variant ? Number(variant.price) : Number(item.price || 0);
        subtotal += price * Math.max(1, Number(item.quantity || 1));
      }
      subtotal = Number(subtotal.toFixed(2));

      let discountAmount = 0;
      if (couponCode) {
        const coupons = readJson(couponsFile, []);
        const cp = coupons.find(c => c.code.toUpperCase() === String(couponCode).toUpperCase() && c.isActive);
        if (cp) {
          discountAmount = cp.discountType === "PERCENT"
            ? Number((subtotal * (cp.discountValue / 100)).toFixed(2))
            : Math.min(Number(cp.discountValue), subtotal);
        }
      }

      const total = Math.max(0, Number((subtotal - discountAmount).toFixed(2)));
      const orderId = `ORD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

      // 1. Balance Payment
      if (paymentMethod === "balance") {
        if (!currentUser) return sendJson(res, 400, { error: "User account not found." });
        if (currentUser.balance < total) {
          return sendJson(res, 400, { error: `Insufficient balance. Required: £${total.toFixed(2)}, Available: £${currentUser.balance.toFixed(2)}.` });
        }

        const purchasedItems = [];
        for (const item of cart) {
          const allocated = allocateProductStock(item, session.userId, orderId);
          if (allocated) {
            purchasedItems.push({
              id: item.option_id,
              product_title: item.product_title,
              option_name: item.option_name,
              quantity: item.quantity,
              price: item.price,
              delivered_content: allocated.credentials,
              credentials: allocated.credentials
            });
          } else {
            purchasedItems.push({
              id: item.option_id,
              product_title: item.product_title,
              option_name: item.option_name,
              quantity: item.quantity,
              price: item.price,
              delivered_content: "Stock allocation pending.",
              credentials: "Stock allocation pending."
            });
          }
        }

        currentUser.balance = Number((currentUser.balance - total).toFixed(2));
        writeJson(usersFile, users);

        const newOrder = {
          id: orderId,
          userId: session.userId,
          status: "COMPLETED",
          paymentMethod: "BALANCE",
          total: total,
          subtotal: subtotal,
          discountAmount: discountAmount,
          couponCode: couponCode,
          items: purchasedItems,
          createdAt: new Date().toISOString()
        };

        const orders = readJson(ordersFile, []);
        orders.unshift(newOrder);
        writeJson(ordersFile, orders);

        allCarts[cartKey] = [];
        writeCarts(allCarts);

        try { onOrderCompleted(newOrder); } catch {}

        return sendJson(res, 200, { success: true, orderId: newOrder.id });
      }

      // 2. Crypto Payment
      if (paymentMethod === "crypto") {
        const payCurrency = String(body.payCurrency || "BTC").toUpperCase();
        const network = body.network || null;

        const npResult = await createNowpaymentPayment({
          amountGbp: total,
          coin: payCurrency,
          network: network,
          orderId: orderId,
          isTopup: false,
          reqHost: req.headers.host
        });

        if (!npResult.success || !npResult.data) {
          return sendJson(res, 400, { error: npResult.error || "Failed to create crypto invoice." });
        }

        const npData = npResult.data;
        const newOrder = {
          id: orderId,
          userId: session.userId,
          status: "PENDING",
          paymentMethod: "CRYPTO",
          total: total,
          subtotal: subtotal,
          discountAmount: discountAmount,
          couponCode: couponCode,
          coin: payCurrency,
          network: network,
          payAmount: npData.pay_amount,
          payAddress: npData.pay_address,
          paymentId: npData.payment_id,
          nowpayments: npData,
          items: cart.map(i => ({
            id: i.option_id,
            product_title: i.product_title,
            option_name: i.option_name,
            quantity: i.quantity,
            price: i.price,
            delivered_content: null
          })),
          createdAt: new Date().toISOString()
        };

        const orders = readJson(ordersFile, []);
        orders.unshift(newOrder);
        writeJson(ordersFile, orders);

        allCarts[cartKey] = [];
        writeCarts(allCarts);

        return sendJson(res, 200, {
          success: true,
          orderId: orderId,
          payUrl: `/pay?invoice=${orderId}`,
          payApiPath: `/api/nowpayments/invoice/${orderId}`
        });
      }

      return sendJson(res, 400, { error: "Unsupported payment method." });
    }

    // ── BALANCE CHARGE (Topup) ────────────────────────────────────────────────
    if (url.pathname === "/api/balance/charge" && req.method === "POST") {
      if (!session) return sendJson(res, 401, { error: "Please sign in to top up your balance." });
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const amount = parseFloat(body.amount || body.amountGbp || 0);
      if (isNaN(amount) || amount < 1) return sendJson(res, 400, { error: "Minimum topup amount is £1.00." });

      const payCurrency = String(body.payCurrency || "BTC").toUpperCase();
      const network = body.network || null;
      const topupId = `TOP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

      const npResult = await createNowpaymentPayment({
        amountGbp: amount,
        coin: payCurrency,
        network: network,
        orderId: topupId,
        isTopup: true,
        reqHost: req.headers.host
      });

      if (!npResult.success || !npResult.data) {
        return sendJson(res, 400, { error: npResult.error || "Failed to create crypto invoice for topup." });
      }

      const npData = npResult.data;
      const newTopup = {
        id: topupId,
        userId: session.userId,
        status: "PENDING",
        paymentMethod: "CRYPTO",
        amount: amount,
        coin: payCurrency,
        network: network,
        payAmount: npData.pay_amount,
        payAddress: npData.pay_address,
        paymentId: npData.payment_id,
        nowpayments: npData,
        createdAt: new Date().toISOString()
      };

      const topups = readJson(topupsFile, []);
      topups.unshift(newTopup);
      writeJson(topupsFile, topups);

      return sendJson(res, 200, {
        success: true,
        orderId: topupId,
        payUrl: `/pay?invoice=${topupId}`,
        payApiPath: `/api/nowpayments/invoice/${topupId}`
      });
    }

    // ── DIRECT PAYMENT ────────────────────────────────────────────────────────
    if (url.pathname === "/api/pay/direct" && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const amount = parseFloat(body.amount || 0);
      if (isNaN(amount) || amount < 0.5) return sendJson(res, 400, { error: "Minimum amount is £0.50." });

      const payCurrency = String(body.payCurrency || "BTC").toUpperCase();
      const network = body.network || null;
      const directId = `PAY-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

      const npResult = await createNowpaymentPayment({
        amountGbp: amount,
        coin: payCurrency,
        network: network,
        orderId: directId,
        isTopup: false,
        reqHost: req.headers.host
      });

      if (!npResult.success || !npResult.data) {
        return sendJson(res, 400, { error: npResult.error || "Failed to create payment invoice." });
      }

      const npData = npResult.data;
      const newOrder = {
        id: directId,
        userId: session ? session.userId : "DIRECT",
        status: "PENDING",
        paymentMethod: "CRYPTO",
        total: amount,
        coin: payCurrency,
        network: network,
        payAmount: npData.pay_amount,
        payAddress: npData.pay_address,
        paymentId: npData.payment_id,
        nowpayments: npData,
        createdAt: new Date().toISOString()
      };

      const orders = readJson(ordersFile, []);
      orders.unshift(newOrder);
      writeJson(ordersFile, orders);

      return sendJson(res, 200, {
        success: true,
        orderId: directId,
        payUrl: `/pay?invoice=${directId}`,
        payApiPath: `/api/nowpayments/invoice/${directId}`
      });
    }

    // ── ORDERS QUERY (1:1 Authed Format) ──────────────────────────────────────
    if (url.pathname === "/api/orders" && req.method === "GET") {
      if (!session) return sendJson(res, 401, { error: "Login required" });
      const orders = readJson(ordersFile, []).filter(o => o.userId === session.userId);
      const page = parseInt(url.searchParams.get("page"), 10) || 1;
      const perPage = parseInt(url.searchParams.get("perPage"), 10) || 10;

      const formattedOrders = orders.map(o => {
        const items = Array.isArray(o.items) ? o.items.map(i => ({
          product_title: i.product_title || i.productTitle || i.name || "Item",
          option_name: i.option_name || i.variantName || "Default",
          quantity: i.quantity || 1
        })) : [];

        const statusLower = String(o.status || "").toLowerCase();
        const isFulfilled = statusLower === "completed" || statusLower === "fulfilled";
        const createdMs = Date.parse(o.createdAt || new Date().toISOString());
        const warrantyMs = 60 * 60 * 1000;
        const expiresMs = createdMs + warrantyMs;
        const remainingMs = Math.max(0, expiresMs - Date.now());

        return {
          id: o.id,
          items: items,
          first_item_title: items[0] ? items[0].product_title : o.id.substring(0, 8),
          total_amount: Number(o.total || o.total_amount || 0),
          subtotal: Number(o.subtotal || o.total || 0),
          tax_amount: Number(o.tax_amount || 0),
          refund_amount: Number(o.refund_amount || 0),
          status: isFulfilled ? "fulfilled" : "pending",
          reason: o.reason || null,
          warrantyMinutes: 60,
          warrantyExpiresAt: new Date(expiresMs).toISOString(),
          warrantyRemainingMs: remainingMs,
          warrantyExpired: remainingMs <= 0,
          created_at: o.createdAt || new Date().toISOString()
        };
      });

      const start = (page - 1) * perPage;
      const paged = formattedOrders.slice(start, start + perPage);

      return sendJson(res, 200, {
        orders: paged,
        total: formattedOrders.length,
        totalPages: Math.max(1, Math.ceil(formattedOrders.length / perPage))
      });
    }

    // ── REPLACEMENTS TAB ENDPOINT (MUST BE BEFORE /api/orders/:id) ────────────
    if (url.pathname === "/api/orders/replacements" && req.method === "GET") {
      if (!session) return sendJson(res, 401, { error: "Login required." });

      const page = parseInt(url.searchParams.get("page") || "1", 10) || 1;
      const perPage = parseInt(url.searchParams.get("perPage") || "25", 10) || 25;
      const searchOid = (url.searchParams.get("orderId") || "").trim().toLowerCase();

      const tickets = readJson(replacementsFile, []);
      const orders = readJson(ordersFile, []);

      const userTickets = tickets.filter(t => 
        (t.userId === session.userId || (session.user && (t.userEmail === session.user.email || t.user_email === session.user.email))) &&
        (t.replacementCredentials || t.replacement_content || t.status === "RESOLVED" || t.status === "REPLACED")
      );

      const list = [];

      userTickets.forEach((t, idx) => {
        const creds = (t.replacementCredentials || t.replacement_content || "").trim();
        if (!creds && t.status !== "RESOLVED") return;
        const lineCount = creds ? creds.split("\n").filter(Boolean).length : 1;
        list.push({
          id: String(t.id || `rep-${idx + 1}`),
          order_id: String(t.orderId || "ORD-REPLACEMENT"),
          product_title: t.productName || "Delivered Item",
          option_name: t.variantName || "Replacement",
          line_count: lineCount || 1,
          replacement_content: creds || "Replacement delivered by staff.",
          is_replacement_order: !!t.isReplacementOrder,
          parent_order_id: t.orderId || null,
          created_at: t.updatedAt || t.createdAt || new Date().toISOString()
        });
      });

      // Also scan orders for replacement flags
      const userOrders = orders.filter(o => o.userId === session.userId || (session.user && o.userEmail === session.user.email));
      userOrders.forEach(o => {
        if (o.reason === "replacement" || (Array.isArray(o.items) && o.items.some(i => (i.credentials || "").includes("[REPLACEMENT")))) {
          (o.items || []).forEach((item, itemIdx) => {
            const creds = item.delivered_content || item.credentials || "";
            if (creds.includes("[REPLACEMENT DELIVERED]") || o.reason === "replacement") {
              const cleanedCreds = creds.includes("[REPLACEMENT DELIVERED]")
                ? creds.split("[Original]:")[0].replace("[REPLACEMENT DELIVERED]:", "").trim()
                : creds;
              const repId = `ord-rep-${o.id}-${itemIdx}`;
              if (!list.some(r => r.order_id === o.id && r.replacement_content === cleanedCreds)) {
                list.push({
                  id: repId,
                  order_id: String(o.id),
                  product_title: item.product_title || item.name || "Replacement Product",
                  option_name: item.option_name || item.variantName || "Delivered",
                  line_count: cleanedCreds.split("\n").filter(Boolean).length || 1,
                  replacement_content: cleanedCreds,
                  is_replacement_order: true,
                  parent_order_id: o.parentOrderId || o.id,
                  created_at: o.createdAt || new Date().toISOString()
                });
              }
            }
          });
        }
      });

      let filtered = list;
      if (searchOid) {
        filtered = filtered.filter(r => 
          r.order_id.toLowerCase().includes(searchOid) || 
          (r.parent_order_id && r.parent_order_id.toLowerCase().includes(searchOid)) ||
          r.product_title.toLowerCase().includes(searchOid)
        );
      }

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      const start = (page - 1) * perPage;
      const paged = filtered.slice(start, start + perPage);

      return sendJson(res, 200, {
        replacements: paged,
        total: total,
        totalPages: totalPages
      });
    }

    if (url.pathname.startsWith("/api/orders/") && req.method === "GET") {
      const orderId = decodeURIComponent(url.pathname.replace(/^\/api\/orders\//, "")).trim();
      if (orderId === "replacements") return sendJson(res, 200, { replacements: [], total: 0, totalPages: 1 });

      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === orderId);
      if (!order) return sendJson(res, 404, { error: "Order not found" });

      const statusLower = String(order.status || "").toLowerCase();
      const isFulfilled = statusLower === "completed" || statusLower === "fulfilled";
      const createdMs = Date.parse(order.createdAt || new Date().toISOString());
      const warrantyMs = 24 * 60 * 60 * 1000;
      const expiresMs = createdMs + warrantyMs;
      const remainingMs = Math.max(0, expiresMs - Date.now());

      const items = Array.isArray(order.items) ? order.items.map(i => ({
        id: i.id || "1",
        product_title: i.product_title || i.productTitle || i.name || "Item",
        option_name: i.option_name || i.variantName || "Default",
        price: Number(i.price || 0),
        quantity: i.quantity || 1,
        delivered_content: i.delivered_content || i.credentials || ""
      })) : [];

      return sendJson(res, 200, {
        order: {
          id: order.id,
          status: isFulfilled ? "fulfilled" : "pending",
          reason: order.reason || null,
          warrantyMinutes: 1440,
          warrantyExpiresAt: new Date(expiresMs).toISOString(),
          warrantyRemainingMs: remainingMs,
          warrantyExpired: remainingMs <= 0,
          total_amount: Number(order.total || 0),
          payment_method: order.paymentMethod || "BALANCE",
          created_at: order.createdAt || new Date().toISOString()
        },
        items: items
      });
    }

    // ── SUPPORT SYSTEM ────────────────────────────────────────────────────────
    if (url.pathname === "/api/support/issues" && req.method === "GET") {
      return sendJson(res, 200, {
        issues: [
          { id: "invalid_creds", label: "Invalid account credentials" },
          { id: "not_working", label: "Account / Key not working" },
          { id: "replacement_req", label: "Replacement request" },
          { id: "wrong_product", label: "Wrong product received" },
          { id: "balance_topup", label: "Balance / Top-up inquiry" },
          { id: "other", label: "Other general support" }
        ]
      });
    }

    if (url.pathname.startsWith("/api/support/order/") && req.method === "GET") {
      const orderId = decodeURIComponent(url.pathname.replace(/^\/api\/support\/order\//, "")).trim();
      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === orderId);
      if (!order) return sendJson(res, 404, { error: "Order not found" });

      const createdMs = Date.parse(order.createdAt || new Date().toISOString());
      const warrantyMs = 24 * 60 * 60 * 1000;
      const expiresMs = createdMs + warrantyMs;
      const remainingMs = Math.max(0, expiresMs - Date.now());

      const items = Array.isArray(order.items) ? order.items.map((i, idx) => ({
        id: String(i.id || idx + 1),
        product_title: i.product_title || i.productTitle || i.name || "Purchased Product",
        option_name: i.option_name || i.variantName || "Default",
        delivered_content: i.delivered_content || i.credentials || ""
      })) : [];

      return sendJson(res, 200, {
        order: {
          id: order.id,
          status: "fulfilled",
          reason: order.reason || "purchase",
          total_amount: Number(order.total || 0),
          created_at: order.createdAt || new Date().toISOString()
        },
        items: items,
        warrantyMinutes: 1440,
        warrantyExpiresAt: new Date(expiresMs).toISOString(),
        warrantyRemainingMs: remainingMs > 0 ? remainingMs : 86400000,
        warrantyExpired: false
      });
    }

    if (url.pathname === "/api/support/upload-image" && req.method === "POST") {
      const contentType = req.headers["content-type"] || "";
      await new Promise(resolve => {
        const chunks = [];
        req.on("data", chunk => chunks.push(chunk));
        req.on("end", () => {
          try {
            const buffer = Buffer.concat(chunks);
            let ext = "png";
            if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
            else if (contentType.includes("webp")) ext = "webp";
            else if (contentType.includes("gif")) ext = "gif";

            let fileData = buffer;
            const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
            if (boundaryMatch) {
              const boundary = boundaryMatch[1] || boundaryMatch[2];
              const parts = buffer.toString("binary").split(`--${boundary}`);
              for (const part of parts) {
                if (part.includes('filename="')) {
                  const headerEnd = part.indexOf("\r\n\r\n");
                  if (headerEnd !== -1) {
                    const rawContent = part.substring(headerEnd + 4, part.length - 2);
                    fileData = Buffer.from(rawContent, "binary");
                    if (part.includes(".jpg") || part.includes(".jpeg")) ext = "jpg";
                    else if (part.includes(".webp")) ext = "webp";
                    break;
                  }
                }
              }
            }
            const filename = `proof_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.${ext}`;
            fs.writeFileSync(path.join(uploadsDir, filename), fileData);
            sendJson(res, 200, { success: true, url: `/uploads/${filename}` });
          } catch (err) {
            sendJson(res, 500, { error: "Failed to upload image: " + err.message });
          }
          resolve();
        });
      });
      return true;
    }

    if (url.pathname === "/api/support/submit" && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const { orderId, orderItemId, issueType, replacementsCount, message, images } = body;

      if (!orderId) return sendJson(res, 400, { error: "Order ID is required." });
      if (!message || !message.trim()) return sendJson(res, 400, { error: "Message is required." });

      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === orderId);

      let productName = "Support Inquiry";
      let variantName = "Default";
      if (order && Array.isArray(order.items) && order.items.length) {
        const item = order.items.find(i => String(i.id) === String(orderItemId)) || order.items[0];
        productName = item.product_title || item.productTitle || item.name || productName;
        variantName = item.option_name || item.variantName || variantName;
      }

      const ticketId = `TCK-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const newTicket = {
        id: ticketId,
        userId: session ? session.userId : (order ? order.userId : "GUEST"),
        userEmail: (session && session.user) ? session.user.email : (order ? order.userEmail : "customer@falconlogs.com"),
        orderId: orderId,
        orderItemId: orderItemId || "",
        productName: productName,
        variantName: variantName,
        issueReason: issueType || "General Support",
        issue_type: issueType || "General Support",
        replacementCount: parseInt(replacementsCount, 10) || 1,
        replacements_count: parseInt(replacementsCount, 10) || 1,
        message: message.trim(),
        images: Array.isArray(images) ? images.map(img => typeof img === "string" ? { image_url: img } : img) : [],
        status: "PENDING",
        replacementCredentials: null,
        replacement_content: null,
        admin_reply: null,
        refundAmount: null,
        messages: [
          {
            senderRole: "USER",
            message: message.trim(),
            createdAt: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const tickets = readJson(replacementsFile, []);
      tickets.unshift(newTicket);
      writeJson(replacementsFile, tickets);

      return sendJson(res, 200, { success: true, ticketId });
    }

    if (url.pathname === "/api/support/tickets" && req.method === "GET") {
      if (!session) return sendJson(res, 200, { tickets: [], total: 0, totalPages: 1 });

      const page = parseInt(url.searchParams.get("page") || "1", 10) || 1;
      const perPage = parseInt(url.searchParams.get("perPage") || "25", 10) || 25;

      const tickets = readJson(replacementsFile, []).filter(t => 
        t.userId === session.userId || (session.user && (t.userEmail === session.user.email || t.user_email === session.user.email))
      );

      const mapped = tickets.map(t => {
        const lastAdminMsg = Array.isArray(t.messages) ? t.messages.filter(m => m.senderRole === "REPLACE_ADMIN").pop() : null;
        return {
          id: t.id,
          order_id: t.orderId,
          product_title: t.productName,
          option_name: t.variantName,
          issue_type: t.issueReason || t.issue_type || "Support",
          replacements_count: t.replacementCount || t.replacements_count || 1,
          message: t.message,
          status: (t.status || "open").toLowerCase(),
          replacement_content: t.replacementCredentials || t.replacement_content || null,
          replacement_order_id: t.replacementOrderId || null,
          admin_reply: t.admin_reply || (lastAdminMsg ? lastAdminMsg.message : null),
          created_at: t.createdAt,
          updated_at: t.updatedAt || t.createdAt
        };
      });

      const total = mapped.length;
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      const start = (page - 1) * perPage;

      return sendJson(res, 200, {
        tickets: mapped.slice(start, start + perPage),
        total,
        totalPages
      });
    }

    if (url.pathname.startsWith("/api/support/tickets/") && req.method === "GET") {
      const ticketId = decodeURIComponent(url.pathname.replace(/^\/api\/support\/tickets\//, "")).trim();
      const tickets = readJson(replacementsFile, []);
      const t = tickets.find(x => x.id === ticketId);
      if (!t) return sendJson(res, 404, { error: "Ticket not found" });

      const lastAdminMsg = Array.isArray(t.messages) ? t.messages.filter(m => m.senderRole === "REPLACE_ADMIN").pop() : null;
      const mappedTicket = {
        id: t.id,
        order_id: t.orderId,
        product_title: t.productName,
        option_name: t.variantName,
        issue_type: t.issueReason || t.issue_type || "Support",
        replacements_count: t.replacementCount || t.replacements_count || 1,
        message: t.message,
        status: (t.status || "open").toLowerCase(),
        replacement_content: t.replacementCredentials || t.replacement_content || null,
        replacement_order_id: t.replacementOrderId || null,
        admin_reply: t.admin_reply || (lastAdminMsg ? lastAdminMsg.message : null),
        created_at: t.createdAt,
        updated_at: t.updatedAt || t.createdAt
      };

      const images = Array.isArray(t.images) ? t.images.map(img => typeof img === "string" ? { image_url: img } : img) : [];
      return sendJson(res, 200, { ticket: mappedTicket, images });
    }

    // ── VOUCHES SYSTEM (STOREFRONT & ADMIN WITH BALANCE CREDITING) ────────────
    if (url.pathname === "/api/vouches/gallery" && req.method === "GET") {
      const vouches = readJson(vouchesFile, []);
      const approved = vouches.filter(v => v.status === "approved" || v.approved === true);
      return sendJson(res, 200, { photos: approved });
    }

    if (url.pathname === "/api/vouches/drafts" && req.method === "GET") {
      const drafts = (session && session.vouchDrafts) ? session.vouchDrafts : [];
      return sendJson(res, 200, { photos: drafts });
    }

    if (url.pathname === "/api/vouches/upload" && req.method === "POST") {
      const contentType = req.headers["content-type"] || "";
      await new Promise(resolve => {
        const chunks = [];
        req.on("data", chunk => chunks.push(chunk));
        req.on("end", () => {
          try {
            const buffer = Buffer.concat(chunks);
            let ext = "jpg";
            if (contentType.includes("png")) ext = "png";
            else if (contentType.includes("webp")) ext = "webp";
            else if (contentType.includes("gif")) ext = "gif";

            let fileData = buffer;
            const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
            if (boundaryMatch) {
              const boundary = boundaryMatch[1] || boundaryMatch[2];
              const parts = buffer.toString("binary").split(`--${boundary}`);
              for (const part of parts) {
                if (part.includes('filename="')) {
                  const headerEnd = part.indexOf("\r\n\r\n");
                  if (headerEnd !== -1) {
                    const rawContent = part.substring(headerEnd + 4, part.length - 2);
                    fileData = Buffer.from(rawContent, "binary");
                    if (part.includes(".png")) ext = "png";
                    else if (part.includes(".webp")) ext = "webp";
                    break;
                  }
                }
              }
            }
            const filename = `vouch_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.${ext}`;
            fs.writeFileSync(path.join(uploadsDir, filename), fileData);
            const photoId = `vouch_draft_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`;
            const photo = {
              id: photoId,
              url: `/uploads/${filename}`,
              image_url: `/uploads/${filename}`,
              name: filename
            };
            globalVouchDrafts.set(photoId, photo);
            if (session && session.userId) {
              globalVouchDrafts.set(`user_${session.userId}_${photoId}`, photo);
            }
            sendJson(res, 200, { success: true, photos: [photo] });
          } catch (err) {
            sendJson(res, 500, { error: err.message });
          }
          resolve();
        });
      });
      return true;
    }

    if (url.pathname.startsWith("/api/vouches/draft/") && req.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.replace(/^\/api\/vouches\/draft\//, "")).trim();
      globalVouchDrafts.delete(id);
      return sendJson(res, 200, { success: true });
    }

    if (url.pathname === "/api/vouches/submit" && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const photoIds = Array.isArray(body.photoIds) ? body.photoIds : [];

      let selected = [];
      photoIds.forEach(id => {
        let photo = globalVouchDrafts.get(id);
        if (!photo && session && session.userId) {
          photo = globalVouchDrafts.get(`user_${session.userId}_${id}`);
        }
        if (photo) selected.push(photo);
      });

      if (!selected.length && photoIds.length) {
        selected = photoIds.map(id => ({
          id,
          url: `/uploads/${id}.png`,
          image_url: `/uploads/${id}.png`
        }));
      }

      const vouches = readJson(vouchesFile, []);
      const userEmail = (session && session.user) ? session.user.email : "customer@falconlogs.com";
      const userId = session ? session.userId : "GUEST";

      selected.forEach(photo => {
        vouches.unshift({
          id: `VCH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
          userId: userId,
          user_email: userEmail,
          userEmail: userEmail,
          image_url: photo.url || photo.image_url,
          url: photo.url || photo.image_url,
          title: "Verified Customer Vouch",
          status: "pending",
          approved: false,
          created_at: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
        globalVouchDrafts.delete(photo.id);
      });

      writeJson(vouchesFile, vouches);
      return sendJson(res, 200, { success: true, count: selected.length });
    }

    // Admin Vouches Management
    if (url.pathname === "/api/admin/vouches" && req.method === "GET") {
      return sendJson(res, 200, { vouches: readJson(vouchesFile, []) });
    }

    if (url.pathname === "/api/admin/vouches/approve" && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const { id, creditAmount } = body;
      const amt = parseFloat(creditAmount) || 0;

      const vouches = readJson(vouchesFile, []);
      const vouch = vouches.find(v => v.id === id);
      if (!vouch) return sendJson(res, 404, { error: "Vouch not found" });

      vouch.status = "approved";
      vouch.approved = true;
      vouch.updatedAt = new Date().toISOString();

      let credited = false;
      let newBalance = 0;
      let creditedUser = null;

      if (amt > 0) {
        const users = readJson(usersFile, []);
        const user = users.find(u => u.id === vouch.userId || u.email === vouch.user_email || u.email === vouch.userEmail);
        if (user) {
          user.balance = Number((Number(user.balance || 0) + amt).toFixed(2));
          writeJson(usersFile, users);
          credited = true;
          newBalance = user.balance;
          creditedUser = user.email;

          const topups = readJson(topupsFile, []);
          topups.unshift({
            id: `VOUCH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
            userId: user.id,
            userEmail: user.email,
            amount: amt,
            status: "COMPLETED",
            paymentMethod: "VOUCH_REWARD",
            method: "VOUCH_REWARD",
            description: `Vouch Reward Credit (£${amt.toFixed(2)}) for Vouch #${id}`,
            createdAt: new Date().toISOString()
          });
          writeJson(topupsFile, topups);
          vouch.creditedAmount = amt;
          vouch.creditedAt = new Date().toISOString();
        }
      }

      writeJson(vouchesFile, vouches);

      return sendJson(res, 200, {
        success: true,
        credited,
        amount: amt,
        userEmail: creditedUser,
        newBalance,
        message: credited
          ? `Vouch approved and £${amt.toFixed(2)} credited to ${creditedUser}!`
          : "Vouch approved and published to store gallery."
      });
    }

    if (url.pathname === "/api/admin/vouches/reject" && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const { id } = body;
      const vouches = readJson(vouchesFile, []).filter(v => v.id !== id);
      writeJson(vouchesFile, vouches);
      return sendJson(res, 200, { success: true });
    }

    if (url.pathname.startsWith("/api/admin/vouches/") && req.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.replace(/^\/api\/admin\/vouches\//, "")).trim();
      const vouches = readJson(vouchesFile, []).filter(v => v.id !== id);
      writeJson(vouchesFile, vouches);
      return sendJson(res, 200, { success: true });
    }

    if (url.pathname === "/api/admin/vouches/create" && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const { image_url, title } = body;
      if (!image_url) return sendJson(res, 400, { error: "Image URL is required" });

      const vouches = readJson(vouchesFile, []);
      const newVouch = {
        id: `VCH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
        userId: "ADMIN",
        user_email: "admin@falconlogs.com",
        userEmail: "admin@falconlogs.com",
        image_url: image_url,
        url: image_url,
        title: title || "Verified Customer Vouch",
        status: "approved",
        approved: true,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      vouches.unshift(newVouch);
      writeJson(vouchesFile, vouches);
      return sendJson(res, 200, { success: true, vouch: newVouch });
    }

    if (url.pathname === "/api/admin/vouches/credit" && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const { userEmail, amount, note } = body;
      const amt = parseFloat(amount) || 0;
      if (!userEmail || amt <= 0) return sendJson(res, 400, { error: "Valid user email and amount required" });

      const users = readJson(usersFile, []);
      const user = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase() || u.id === userEmail);
      if (!user) return sendJson(res, 404, { error: "User not found with email: " + userEmail });

      user.balance = Number((Number(user.balance || 0) + amt).toFixed(2));
      writeJson(usersFile, users);

      const topups = readJson(topupsFile, []);
      topups.unshift({
        id: `VOUCH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
        userId: user.id,
        userEmail: user.email,
        amount: amt,
        status: "COMPLETED",
        paymentMethod: "VOUCH_REWARD",
        method: "VOUCH_REWARD",
        description: note || `Manual Vouch Reward Credit (£${amt.toFixed(2)})`,
        createdAt: new Date().toISOString()
      });
      writeJson(topupsFile, topups);

      return sendJson(res, 200, {
        success: true,
        amount: amt,
        userEmail: user.email,
        newBalance: user.balance
      });
    }

    return false;
  }

  return {
    handleAuthedApi,
    injectDynamicPageElements,
    getUserCartKey,
    parseRequestBody
  };
}

module.exports = { createAuthedSystem };

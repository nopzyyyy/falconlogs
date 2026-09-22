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
    onOrderCompleted
  } = deps;

  const cartsFile = path.join(dataDir, "carts.json");
  const ticketsFile = path.join(dataDir, "tickets.json");

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
    const isVery = currentPath === "/very" || currentPath === "/very.html";
    const isNotifications = currentPath === "/notifications" || currentPath === "/notifications.html";
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
    <ul class="navbar-nav align-items-center">
      <li class="nav-item"><a class="nav-link ${isHome ? 'active' : ''}" href="/products">Home</a></li>
      <li class="nav-item"><a class="nav-link ${isOrders ? 'active' : ''}" href="/dashboard/orders">Orders</a></li>
      <li class="nav-item"><a class="nav-link ${isSupport ? 'active' : ''}" href="/support">Support</a></li>
      <li class="nav-item"><a class="nav-link ${isVouches ? 'active' : ''}" href="/vouches">Vouches</a></li>
      <li class="nav-item"><a class="nav-link ${isVery ? 'active' : ''}" href="/very">VERY</a></li>
      <li class="nav-item nav-item-notifications">
        <a class="nav-link ${isNotifications ? 'active' : ''}" href="/notifications">Notifications</a>
        <span class="nav-notif-badge" id="navNotifCount" hidden>0</span>
      </li>
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
            <path d="M274.272-95.384q-30.272 0-51.118-20.882-20.847-20.882-20.847-51.154 0-30.272 20.882-51.118 20.882-20.847 51.154-20.847 30.272 0 51.119 20.882 20.846 20.882 20.846 51.154 0 30.272-20.882 51.118-20.881 20.847-51.154 20.847Zm399.385 0q-30.272 0-51.119-20.882-20.846-20.882-20.846-51.154 0-30.272 20.882-51.118 20.881-20.847 51.154-20.847 30.272 0 51.118 20.882 20.847 20.882 20.847 51.154 0 30.272-20.882 51.118-20.882 20.847-51.154 20.847ZM231.231-742 334-527.385h271.385q6.923 0 12.307-3.461 5.385-3.462 9.231-9.615l98.615-180.001q4.616-8.461.77-14.999Q722.462-742 713.231-742h-482Zm-31.539-66h574.77q25.587 0 38.486 21.269 12.898 21.269.129 43.808L678.769-500.615q-9.692 17.615-27.026 28.423t-38.051 10.808H316l-36.615 65.23q-6.154 9.231-.385 20t17.308 10.769h418.384q13.539 0 23.27 9.731t9.731 23.269q0 13.539-9.731 23.27t-23.27 9.731H274.308q-43 0-62.731-36.5-19.731-36.501-.346-72.27l56.153-103.231L120.307-822H75q-13.539 0-23.27-9.731Q42-841.461 42-855q0-13.539 9.73-23.269Q61.462-888 75-888h57.308q13.128 0 24.153 6.672 11.026 6.672 16.924 18.713L199.692-808ZM334-527.385h286-286Z" fill="currentColor"></path>
          </svg>
          <span id="cartItemsCount">0</span>
        </a>
      </li>
    </ul>
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
    <ul class="navbar-nav align-items-center">
      <li class="nav-item"><a class="nav-link ${isHome ? 'active' : ''}" href="/products">Home</a></li>
    </ul>
    <ul class="navbar-nav ms-auto navbar-auth-actions">
      <li class="nav-item"><a class="nav-link btn btn-primary" href="/auth/login">login</a></li>
      <li class="nav-item navbar-auth-or-wrap"><span class="navbar-auth-or text-white">or</span></li>
      <li class="nav-item"><a class="nav-link btn btn-gradient" href="/auth/signup">create account</a></li>
    </ul>
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

      const nextUrl = url.searchParams.get("next") || "/products";
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
      res.writeHead(302, {
        "Location": "/products",
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

    // ── CART APIS ─────────────────────────────────────────────────────────────
    if (url.pathname === "/api/cart" && req.method === "GET") {
      const cartKey = getUserCartKey(req, session);
      const allCarts = readCarts();
      const items = allCarts[cartKey] || [];
      return sendJson(res, 200, { items });
    }

    if (url.pathname === "/api/cart/add" && req.method === "POST") {
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
              delivered_content: allocated.credentials
            });
          } else {
            purchasedItems.push({
              id: item.option_id,
              product_title: item.product_title,
              option_name: item.option_name,
              quantity: item.quantity,
              price: item.price,
              delivered_content: "Stock allocation pending."
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

    if (url.pathname.startsWith("/api/orders/") && req.method === "GET") {
      const orderId = decodeURIComponent(url.pathname.replace(/^\/api\/orders\//, "")).trim();
      const orders = readJson(ordersFile, []);
      const order = orders.find(o => o.id === orderId);
      if (!order) return sendJson(res, 404, { error: "Order not found" });

      const statusLower = String(order.status || "").toLowerCase();
      const isFulfilled = statusLower === "completed" || statusLower === "fulfilled";
      const createdMs = Date.parse(order.createdAt || new Date().toISOString());
      const warrantyMs = 60 * 60 * 1000;
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
          warrantyMinutes: 60,
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

    if (url.pathname === "/api/orders/replacements" && req.method === "GET") {
      return sendJson(res, 200, { replacements: [], total: 0, totalPages: 1 });
    }

    // ── SUPPORT & CHAT ────────────────────────────────────────────────────────
    if (url.pathname === "/api/support/issues" && req.method === "GET") {
      return sendJson(res, 200, {
        issues: [
          "Order not received",
          "Invalid account credentials",
          "Balance topup inquiry",
          "Product question",
          "Replacement request",
          "Other general support"
        ]
      });
    }

    if (url.pathname === "/api/support/tickets" && req.method === "GET") {
      const tickets = session ? readJson(ticketsFile, []).filter(t => t.userId === session.userId) : [];
      return sendJson(res, 200, { tickets });
    }

    if (url.pathname === "/api/support/submit" && req.method === "POST") {
      const raw = await parseBody(req);
      const body = parseRequestBody(raw);
      const ticketId = `TCK-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const newTicket = {
        id: ticketId,
        userId: session ? session.userId : "GUEST",
        subject: body.subject || body.issue || "Support Inquiry",
        message: body.message || "",
        status: "OPEN",
        createdAt: new Date().toISOString()
      };
      const tickets = readJson(ticketsFile, []);
      tickets.unshift(newTicket);
      writeJson(ticketsFile, tickets);
      return sendJson(res, 200, { success: true, ticketId });
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

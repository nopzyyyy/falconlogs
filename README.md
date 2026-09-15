# Falcon Logs - Digital Marketplace

> **Production-Ready Digital Accounts & Logs Storefront & Backend**  
> Custom Falcon Orange Theme (`#ea580c`) · Geometric Centered Header · Instant Automated Stock Delivery · NOWPayments Crypto & Store Credit

---

## 🚀 Overview

**Falcon Logs** is a high-performance digital goods marketplace engineered for selling digital accounts, logs, and services. It provides automated instant delivery upon payment, support for both account store credit and cryptocurrency (Bitcoin, Litecoin, Ethereum, Solana, USDT, USDC, TRX via NOWPayments), and an admin back-office for inventory management.

---

## 🎨 Design System & UI Guidelines

Falcon Logs follows strict, sleek cyber aesthetic rules:

- **Falcon Orange Theme**: Primary accent `#ea580c`, hover `#fb923c`, active `#c2410c`. Deep dark backgrounds (`#060913` canvas, `#080c18` enclosed header, `#111628` cards).
- **Zero Glow**: No glowing text, no neon box-shadows, no hazy drop-shadows. Flat, clean, and crisp.
- **Zero Fade Animations**: Transitions use crisp structural transforms (`translateX`, snappy top loading bars) without opacity fading.
- **Crisp Geometric Edges**: Less rounded corners (`border-radius: 6px` on buttons, `8px` on cards).
- **Borderless Architecture**: Elements use `border: none;` or subtle `1px solid rgba(255, 255, 255, 0.07)`.
- **True Mathematical Header Centering**: Header uses a 3-column CSS Grid (`1fr auto 1fr`) so the center navigation links (`Logs`, `Orders`, `Support`) sit perfectly at 50% viewport width.
- **Responsive Mobile Drawer**: On viewports `<= 768px`, desktop navigation links collapse into a slide-in side drawer toggled by a hamburger menu.

> For complete UI specifications and component rules, see the agent skill at [`.agents/skills/falcon-logs-design-system/SKILL.md`](.agents/skills/falcon-logs-design-system/SKILL.md).

---

## 📋 Features & Page Structure

1. **Storefront / Catalog (`/` or `/index.html` / `logs.html`)**
   - Instant search and category dropdown filtering.
   - Dynamic product grid rendering 9+ live catalog items with real-time stock counters (1,700+ unsold accounts).
   - Purchase modal featuring quantity stepper, variant selector, dynamic price recalculation, and instant stock availability tags.
   - Interactive Add to Cart feedback: button turns green with `✓ Added to Cart!`, cart badge animates with bounce, and an interactive toast appears with a direct `View Cart →` link.
   - "Buy Now" button automatically adds item and routes straight to checkout.

2. **Cart & Checkout (`cart.html`)**
   - Live synchronization with product catalog prices and variant stock.
   - Coupon code validation engine (`PERCENT` or `FIXED_AMOUNT`).
   - Payment method selection: Account Balance or Crypto (BTC, LTC, ETH, SOL, USDT TRC20/ERC20/SOL, USDC, TRX).
   - **Mandatory Login Enforcement**: Unauthenticated visitors cannot checkout. A warning banner prompts the user to sign in, the checkout button switches to `Log in to Checkout →`, and checkout submissions without an active session are blocked and redirected to `/login.html`.

3. **Dedicated Balance & Deposit (`deposit.html`)**
   - Standalone deposit portal for topping up store credit.
   - Preset amounts (`£5`, `£10`, `£25`, `£50`, `£100`) and custom amount entry.
   - Seamless crypto payment generation via NOWPayments.
   - `/balance.html` automatically redirects to `/deposit.html`.

4. **Account Settings (`dashboard.html`)**
   - Dedicated exclusively to user account security and profile details.
   - Change Password form with live validation and visibility toggle buttons.
   - Past orders and deposits history with direct invoice links.
   - Dedicated link to `/deposit.html` for topups.

5. **Orders & Digital Delivery (`orders.html`)**
   - Comprehensive orders table with status badges (`Fulfilled`, `Processing`, `Unpaid`, `Failed`).
   - Order detail modal with Products tab and View Stock subview.
   - Instant digital fulfillment: upon payment confirmation, credentials (e.g. `user:pass` or account cookies) are delivered directly into the order record with a 1-click `Copy Stock` button.

6. **Support (`support.html`)**
   - Support ticket submission and official Telegram channel links.

7. **Admin Back-Office (`admin.html` / `god.html`)**
   - Full product, variant, category, inventory, and order management dashboard.

---

## 🛠️ Installation & Running Locally

### Prerequisites
- **Node.js**: v18 or higher recommended
- **Python**: v3.10+ (for daemons and test verification)

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Configure environment (copy example)
cp .env.example .env

# 3. Start the production server
node server.js
```
The server will start listening on port `3001`:
```
http://localhost:3001
```

---

## 📊 Completed Progress Tracker

- [x] **Falcon Orange Theme**: Complete palette migration to `#ea580c` across all HTML pages, CSS sheets, and SVGs.
- [x] **Brand Identity**: Replaced all logos and favicons with official Falcon Logs assets (`logo.png`, `login-logo.png`, `favicon.svg`).
- [x] **Header Centering**: Upgraded `.store-site-header` to 3-column CSS Grid (`1fr auto 1fr`) ensuring mathematical centering (offset <= 0.2px).
- [x] **Mobile Drawer**: Responsive slide-in navigation drawer injected across all pages with real-time auth sync.
- [x] **Product Catalog Bugfix**: Resolved `keepShoppingBtn` ReferenceError in `logs.js`, restoring all 9 live catalog products.
- [x] **Add to Cart Feedback**: Button state confirmation (`✓ Added to Cart!`), cart badge bounce animation, and interactive toast with `View Cart →` shortcut.
- [x] **Mandatory Login**: Restricted checkout to authenticated users across frontend UI notices and backend API security (`requireUser`).
- [x] **Balance & Deposit Separation**: Stripped balance card from `dashboard.html` to keep account page clean; made `deposit.html` the dedicated deposit page.
- [x] **Instant Order Fulfillment**: Verified stock allocation and digital delivery under `orders.html`.
- [x] **UI Skill Specification**: Added `.agents/skills/falcon-logs-design-system/SKILL.md`.
- [x] **Automated Test Verification**: Selenium verification suite passed across desktop header centering, mobile drawer, catalog rendering, and auth checks.

---

## 📄 License & Ownership
Copyright © 2026 Falcon Logs. All rights reserved.

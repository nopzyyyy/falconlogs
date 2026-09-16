---
name: falcon-logs-design-system
description: >-
  Design guidelines, typography rules, color tokens, button scales, spacing standards,
  and UI specifications for Falcon Logs storefront, orders, support, deposit, and account pages.
  Activate whenever modifying, styling, or creating pages and features for Falcon Logs.
---

# Falcon Logs Design System & UI Specification

This skill defines the official visual design language, spatial hierarchy, color tokens, typography rules, and component standards for **Falcon Logs** (`https://falconlogs.com` / `http://localhost:3001`). Follow these rules whenever creating or modifying any page, modal, card, table, or UI component.

---

## 1. Core Visual Philosophy & Strict Rules

1. **Falcon Orange Cyber Theme (`#ea580c` / `#fb923c`)**:
   - Primary Brand Accent: **`#ea580c`** (Vibrant Falcon Orange).
   - Light Accent / Hover: **`#fb923c`** (Bright Orange).
   - Deep Hover / Active: **`#c2410c`** (Burnt Orange).
   - Canvas Background: **`#060913`** (Deep midnight cyber navy).
   - Enclosed Card Header: **`#080c18`** with faint border `1px solid rgba(255, 255, 255, 0.07)`.
   - Card / Box Backgrounds: **`#111628`** (Sleek slate navy).
   - Inputs / Inner Wells: **`#090e1c`** or **`#0d1322`**.

2. **Strict Rule: ZERO Glow Effects**:
   - **Never** use `box-shadow: 0 0 ...`, neon text glow, or drop-shadow glow. All cards, buttons, badges, and modals must remain flat, crisp, and clean.

3. **Strict Rule: ZERO Fade Animations**:
   - Do **not** use opacity-fade animations (e.g. `@keyframes fadeIn`, `fade-in`, or `transition: opacity`).
   - Use crisp structural transitions (`transform: translateX()`, snappy top progress loaders, or direct state swaps).

4. **Less Rounded Corners (Crisp Geometric Style)**:
   - Buttons: `border-radius: 6px`.
   - Cards & Modals: `border-radius: 8px`.
   - Badges & Chips: `border-radius: 4px` - `6px`.
   - Steppers & Inputs: `border-radius: 6px`.

5. **Borderless & Stroke-Free Architecture**:
   - No heavy, high-contrast borders or thick outlines. Elements use `border: none;` or subtle `1px solid rgba(255, 255, 255, 0.07)`.
   - **Cart & Checkout Boxes**: All container cards (`.cart-section-box`, `.order-summary-card`, `.cart-item-card`, `.payment-method-card`, `.store-search-input`, `.cart-coupon-input`) must have **ZERO borders and ZERO shadows** (`border: none !important; box-shadow: none !important;`). Active payment selection is indicated solely through background contrast (`#23160a`), never high-contrast borders.
   - **Account Balance Icon**: The store credit/balance wallet icon must use Falcon Orange (`#ea580c`), never blue. Cache headers for SVG assets are set to `no-cache, no-store, must-revalidate`.

---

## 2. Header Architecture & True Centering

The Falcon Logs header uses an enclosed floating card layout with a 3-column CSS Grid:

```css
.site-header-wrap {
  width: 100%;
  max-width: 1200px;
  margin: 16px auto;
  padding: 0 16px;
}

.store-site-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  background: #080c18;
  height: 64px;
  padding: 0 22px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.brand {
  justify-self: start;
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.header-nav-center {
  justify-self: center;
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 12px;
}
```

### Brand Logo & Typography
The header brand link `.brand` contains:
- Image: `/logo.png` (`height: 38px`, auto width).
- Text stack `.brand-text`:
  - Top line `.brand-name-top`: `FALCON` (`14px`, weight 800, color `#ffffff`, tracking `1.2px`).
  - Bottom line `.brand-name-bottom`: `LOGS` (`10px`, weight 800, color `#ea580c`, tracking `2.8px`).

### Hero Section Logo
- In the hero section (`index.html` & `logs.html`), the dedicated fiery falcon logo (`/hero-logo.png`) is displayed directly above the "Welcome to Falcon Logs" heading at `height: 88px` (responsive to `64px` on mobile). The header keeps the standard brand icon (`/logo.png`).

### Navigation Links
The middle navigation has exactly 3 primary links:
- **Logs** (`/` or `/logs.html`): SVG database/cylinder icon.
- **Orders** (`/orders.html`): SVG 3D package box icon.
- **Support** (`/support.html`): SVG headset/support icon.

Active link styling:
- Text color: `#ffffff`
- Background: `rgba(234, 88, 12, 0.14)`
- Icon stroke: `#ea580c`
- Font weight: `600`

---

## 3. Responsive Mobile Drawer (<= 768px)

On mobile viewports (`max-width: 768px`):
- `.header-nav-center` is hidden (`display: none !important;`).
- `.mobile-menu-toggle-btn` (hamburger icon) is shown on the right side of the header.
- Clicking the hamburger opens `#mobileNavDrawer` from the right (`right: 0;`), accompanied by `#mobileDrawerBackdrop`.
- Drawer contains: Brand logo, Close button (`×`), nav links (`Logs`, `Orders`, `Support`, `Add Balance`, `Account/Login`), and a full-width orange `View Cart` button at the bottom.

---

## 4. Typography Hierarchy

- **Primary Font**: `'Montserrat', sans-serif`
  - Body / General Text: `400` / `500`
  - Buttons / Navigation: `600` / `700`
  - Section Headings / Titles: `700` / `800`
- **Code & Credentials Font**: `'JetBrains Mono', monospace`
  - Stock account data, logs, API keys, order credentials: `12px` / `13px`, `#fdba74` text on `#04060b` background.

---

## 5. Dedicated Pages Architecture

1. **Catalog / Logs (`/` / `logs.html`)**:
   - Search bar with live instant filtering.
   - Category dropdown (collapsed by default).
   - Product grid with 9 live catalog items (1,700+ in-stock accounts).
   - Purchase modal with quantity stepper, variant selector, and instant live total recalculation.
   - Add to Cart button feedback: text flips to `✓ Added to Cart!`, turns green `#15803d` for 1.5s, bounces cart badge, and displays interactive toast with `View Cart →`.

2. **Dedicated Deposit & Balance (`deposit.html`)**:
   - Dedicated page strictly for topping up balance and viewing store credit.
   - Preset chips (`£5`, `£10`, `£25`, `£50`, `£100`) + custom GBP amount input.
   - Cryptocurrency selection (BTC, LTC, ETH, SOL, USDT, USDC, TRX) via NOWPayments.
   - `balance.html` permanently redirects to `deposit.html`.

3. **Account Settings (`dashboard.html`)**:
   - Strictly reserved for profile identity, Change Password form, past orders list, and session sign-out.
   - Balance topup card is stripped and replaced with a clean link: `Looking to manage balance or top up? Go to Deposit Page →`.

4. **Cart & Mandatory Authentication (`cart.html`)**:
   - **Mandatory Login**: Unauthenticated visitors are strictly blocked from purchasing.
   - If not logged in:
     - Prominent warning banner: `⚠️ You must be logged in to checkout. [Log In →]`
     - Checkout button text: `Log in to Checkout →`
     - Clicking checkout immediately prompts and redirects to `/login.html`.
   - Backend `/api/orders/checkout` enforces session verification (`requireUser`).

5. **Instant Order Delivery (`orders.html`)**:
   - Orders list with search, filter tabs, and modal details.
   - Instant digital fulfillment: upon payment confirmation (Balance or Crypto), credentials are saved in order records and viewable in the `View Stock` subview with a `Copy Stock` action.

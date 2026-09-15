---
name: mysterio-design-system
description: >-
  Design guidelines, typography rules, color tokens, button scales, spacing standards,
  and UI specifications for the Mysterio storefront, dashboard, orders, and admin panel.
  Activate whenever modifying, styling, or creating pages and features for Mysterio.
---

# Mysterio Design System & UI Specification

This skill defines the official visual design language, spatial hierarchy, color tokens, typography rules, and component standards for **Mysterio.cc**. Follow these rules whenever creating or modifying any page, modal, card, table, or UI component.

---

## 1. Core Visual Philosophy

1. **Lighter, Distinct Box Backgrounds (`#111628`)**:
   - All primary UI cards, data table wrappers, filter rows, and modal containers use a sleek, visibly lighter dark navy/slate tone: **`#111628`**.
   - This ensures cards have clear, distinct contrast against the deep cyber background canvas (`#060913`).
   - Nested inputs and sub-cards inside a box use a deeper inner tone: **`#090e1c`** (or `#080c18`).

2. **Zero Shadows & Clean Borderless Architecture**:
   - **Strict Rule**: Never use heavy drop shadows (`box-shadow: none;` across all cards, tables, pagination, and modals).
   - Avoid thick or high-contrast borders (`border: none;` or subtle `1px solid rgba(255, 255, 255, 0.05)` only).

3. **No Unwanted Hover Animations on Storefront Product Cards**:
   - Product cards on the storefront must remain static on mouse hover (**NO** hover lift/translateY, **NO** scale jump, and **NO** border highlight/color glow).

4. **Spacious & Generous Scale**:
   - Use comfortable, airy layouts with generous padding (`28px 32px` on dashboard cards, `860px` max-width container, `20px` card gaps).
   - Generous touch and click targets: `44px - 48px` input heights, `40px - 48px` primary action button heights.

---

## 2. Color Palette & Tokens

- **Background Canvas**: `#060913` (Deep midnight cyber navy)
- **Header Background**: `#080c18` (Enclosed card header)
- **Primary Boxes / Cards / Modals / Tables**: `#111628` (Lighter slate-blue card background)
- **Inner Inputs / Nested Sub-cards**: `#090e1c`
- **Table Header Rows**: `#141a30`
- **Primary Accent (Electric Sapphire)**: `#2563eb`
  - Hover: `#1d4ed8` / `#3b82f6`
  - Light Accent / Links: `#60a5fa`
  - Soft Tag / Pill Text: `#93c5fd`
  - Soft Tag / Pill Background: `#111a33`
- **Status Colors**:
  - Fulfilled / Success: `#4ade80` (or `#22c55e`)
  - Processing / Info: `#60a5fa`
  - Unpaid / Warning: `#f97316` (or `#f59e0b`)
  - Failed / Danger: `#f87171` (or `#ef4444`)

---

## 3. Typography Hierarchy

- **Primary UI Font**: `'Montserrat', sans-serif`
  - **Weight**: Bold / Extra Bold (`700` / `800` / `900`)
  - **Headings & Titles**: `28px` (`Your dashboard`), `20px` (`X ORDERS FOUND`), `16px - 18px` (Modal & card headings).
  - **Section Tags & Field Labels**: `11px - 11.5px` uppercase, `letter-spacing: 0.8px`, color `rgba(255, 255, 255, 0.45)`.
  - **Action Buttons**: `13.5px - 14.5px`, `font-weight: 700`.
- **Monospace Numbers & Balances**: `'JetBrains Mono', monospace`
  - Applied to balances (e.g., `[$0.00]`), raw account credentials, order tokens, transaction hashes, and prices.
- **Body & Helper Text**: `'Montserrat'` / `'Inter'`
  - Subtexts: `12.5px - 13px`, color `rgba(255, 255, 255, 0.5)`.

---

## 4. Component Standards & Specifications

### A. Enclosed Card Header Navigation
- **Structure**: Enclosed card (`.site-header-wrap` & `.store-site-header`) with `border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.14); background: #080c18; height: 54px;`.
- **Content**: Brand logo on the left, Cart icon badge + vertical divider + Account dropdown trigger on the right.
- **Account Dropdown Modal (`#accountDropdownCard`)**:
  - Anchored under user button with user email, monospace balance `[$0.00]`, **Dashboard**, **Orders**, **Support**, and **Log out** action buttons.
  - Fully responsive with mobile viewport clamping (`<600px`).

### B. User Dashboard (`dashboard.html`)
- **Shell**: Max-width `860px`, centered, `padding: 36px 20px 80px`.
- **Header Row**:
  - Left: `ACCOUNT` tag, `Your dashboard` heading (`28px` Montserrat 800), and user email.
  - Right: Ghost `✕ Sign out` button (`border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 0 18px; height: 38px;`).
- **Card 1 (Balance)**:
  - Background `#111628`, `border-radius: 10px; padding: 28px 32px;`.
  - Wallet icon pill (`48px 48px`, `#60a5fa` on sapphire tint), `BALANCE` label, `28px` bold `$0.00`, helper subtext, and electric sapphire **Deposit** button.
- **Card 2 (Past Orders)**:
  - Box icon + `PAST ORDERS` header, real-time past order count + dynamic product browse / order history links.
- **Card 3 (Change Password)**:
  - `CHANGE PASSWORD` uppercase header.
  - Fields: `CURRENT PASSWORD`, `NEW PASSWORD`, `CONFIRM NEW PASSWORD` (height `48px`, background `#090e1c`).
  - Full-width electric sapphire **Update password** button (`#2563eb`, height `48px`).

### C. Orders Page (`orders.html`)
- **Count Header**: `<span style="color:#60a5fa;">X</span> ORDERS FOUND` (`20px` bold).
- **Filter Row**:
  - Order ID search bar (`height: 46px; background: #111628; border: none;`).
  - Status dropdown selector (`height: 46px; background: #111628; border: none;`).
- **Data Table**:
  - Container: `.orders-table-wrapper` with `background: #111628; border: none; border-radius: 8px; box-shadow: none;`.
  - Columns: **`TITLE`**, **`REASON`**, **`PAID`**, **`EXPECTED`**, **`STATUS`**, **`DATE`**.
  - Row hover: Subtle `rgba(255, 255, 255, 0.03)`.
- **Order Info Modal**:
  - Multi-tab popup (`#111628` background, borderless, shadowless).
  - **`INFO` Tab**: Order ID, creation date, reason (`cart` / `charge`), expected/paid amounts, status, logs count, and copy links.
  - **`PRODUCTS` Tab**: Item rows breakdown with titles, options, quantities, unit prices, total, and **View stock** action.
  - **`View stock` Subview**: Monospace terminal box with full delivered credentials + **Copy Stock** & **Back** buttons.

### D. Admin Panel Popups & Forms
- **Modals**: Borderless, spacious (`760px` width for stock manager), with top-right close cross buttons (`✕`).
- **Buttons**: Electric sapphire `#2563eb` action buttons, dark sapphire `#111a33` secondary pills, and coral delete pills.
- **Feedback & Feedback States**:
  - Save button loading states (`Saving...` with spinner) & transition to `✓ Saved!`.
  - Floating toast notifications (`siteToast(msg, type)`).

---

## 5. Golden Implementation Rules

1. **Box Background Rule**: Always use **`#111628`** for card boxes and tables; use **`#090e1c`** for inputs inside boxes.
2. **Shadowless Rule**: Always set **`box-shadow: none;`** on cards, tables, pagination, and modals.
3. **Typography Rule**: Always use **`Montserrat` 700 / 800 bold** for titles, buttons, tags, and field labels.
4. **Header Rule**: Always keep the enclosed card header uniform across all customer-facing pages (`index.html`, `cart.html`, `orders.html`, `dashboard.html`).
5. **Mobile Responsiveness**: Ensure all filters, tables, and modal components wrap cleanly on mobile screens (`<650px` / `<768px`).

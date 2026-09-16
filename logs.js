const grid = document.querySelector("#productGrid");
const search = document.querySelector("#productSearch");
const countNum = document.querySelector("#productCountNum");
const categoryDropdownToggle = document.querySelector("#categoryDropdownToggle");
const categoryMenuPanel = document.querySelector("#categoryMenuPanel");
const selectedCategoryLabel = document.querySelector("#selectedCategoryLabel");

let products = [];
let categories = [];
let activeCategory = "All";

let selectedProduct = null;
let selectedVariant = null;
let selectedQty = 1;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function formatVariantName(name) {
  if (!name) return "";
  let varName = String(name).trim();
  varName = varName.replace(/(\d+(?:\.\d+)?)\s*\$/g, "£$1")
                   .replace(/\$\s*(\d+(?:\.\d+)?)/g, "£$1")
                   .replace(/(\d+(?:\.\d+)?)\s*£/g, "£$1");
  return varName;
}

// Check logged in user status
async function checkAuthStatus() {
  if (typeof initGlobalAccountHeader === "function") {
    await initGlobalAccountHeader();
  }
}

// Category Dropdown Toggle & Open/Close Helpers
function openCategoryDropdown() {
  if (!categoryMenuPanel || !categoryDropdownToggle) return;
  categoryMenuPanel.style.display = "flex";
  categoryDropdownToggle.classList.add("open");
  categoryDropdownToggle.setAttribute("aria-expanded", "true");
  const searchInp = document.querySelector("#categorySearchInput");
  if (searchInp) {
    searchInp.value = "";
    filterCategoryItems("");
    setTimeout(() => searchInp.focus(), 60);
  }
}

function closeCategoryDropdown() {
  if (!categoryMenuPanel || !categoryDropdownToggle) return;
  categoryMenuPanel.style.display = "none";
  categoryDropdownToggle.classList.remove("open");
  categoryDropdownToggle.setAttribute("aria-expanded", "false");
}

if (categoryDropdownToggle && categoryMenuPanel) {
  categoryDropdownToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isCurrentlyOpen = categoryMenuPanel.style.display === "flex";
    if (isCurrentlyOpen) {
      closeCategoryDropdown();
    } else {
      openCategoryDropdown();
    }
  });

  categoryMenuPanel.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!categoryDropdownToggle.contains(e.target) && !categoryMenuPanel.contains(e.target)) {
      closeCategoryDropdown();
    }
  });

  // Close dropdown on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && categoryMenuPanel.style.display === "flex") {
      closeCategoryDropdown();
      categoryDropdownToggle.focus();
    }
  });
}

const ICON_MAP = {
  restaurant: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-3.4 3.4a2.5 2.5 0 0 0 0 3.5l2.5 2.5a2.5 2.5 0 0 0 3.5 0L22 8Z"/><path d="m15 5 5 5"/><path d="m8.5 8.5 6 6"/><path d="m2 22 7.5-7.5"/></svg>`,
  hotel: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/><path d="M9 16h6"/><path d="M9 12h6"/><path d="M9 8h6"/></svg>`,
  flight: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.7 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1Z"/></svg>`,
  card_giftcard: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="8" rx="2"/><path d="M12 5a3 3 0 1 0-3 3h6a3 3 0 1 0-3-3Z"/><path d="M12 8v14"/><path d="M3 13h18"/></svg>`,
  shopping_bag: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  shopping_cart: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
  beach_access: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M4.93 4.93 19.07 19.07"/><path d="M4.93 19.07 19.07 4.93"/></svg>`,
  confirmation_number: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/><path d="M9 5v14"/></svg>`,
  local_gas_station: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M15 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L20.41 6.41a2 2 0 0 0-1.41-.59H17"/><path d="M7 11h4"/><rect width="8" height="5" x="5" y="4" rx="1"/></svg>`,
  checkroom: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10a2 2 0 1 0-2-2 2.5 2.5 0 0 1 2.5 2.5V11"/><path d="M2 17.5 10.6 13a2.4 2.4 0 0 1 2.8 0L22 17.5a1 1 0 0 1-.5 1.8H2.5a1 1 0 0 1-.5-1.8Z"/></svg>`,
  home: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  play_circle_outline: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>`,
  movie: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`,
  directions_car: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 12 10s-6.7.6-8.5 1.1C2.7 11.3 2 12.1 2 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 10l2-5h10l2 5"/></svg>`,
  workspace_premium: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>`,
  mail: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  grid_view: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
  folder: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
  star: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  settings: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  person: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  vpn_key: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 2-2 2m-1.5 1.5L16 4l-4 4m6-2-4 4"/><circle cx="7.5" cy="16.5" r="4.5"/></svg>`,
  credit_card: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  shield: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  build: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  cloud: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`,
  dns: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`,
  security: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  notifications: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  chat: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  terminal: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  headset_mic: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
  lock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  help_outline: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
};

function getCategoryIconHtml(icon) {
  const defaultSvg = `<svg class="category-dropdown-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:#fb923c;flex-shrink:0;"><rect width="7" height="7" x="3" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="14" rx="1"></rect><rect width="7" height="7" x="3" y="14" rx="1"></rect></svg>`;
  
  if (!icon || icon === "grid" || icon === "grid_view") {
    return defaultSvg;
  }
  if (ICON_MAP[icon]) {
    return `<span style="display:inline-flex;align-items:center;width:16px;height:16px;color:#fb923c;flex-shrink:0;">${ICON_MAP[icon]}</span>`;
  }
  if (typeof icon === "string" && icon.startsWith("<svg")) {
    return `<span style="display:inline-flex;align-items:center;width:16px;height:16px;color:#fb923c;flex-shrink:0;">${icon}</span>`;
  }
  if (typeof icon === "string" && (icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("/"))) {
    return `<img src="${escapeHtml(icon)}" alt="" style="width:16px;height:16px;object-fit:contain;flex-shrink:0;">`;
  }
  return defaultSvg;
}

function updateCategoryToggleLabel() {
  if (!categoryDropdownToggle) return;
  const leftWrap = categoryDropdownToggle.querySelector(".category-dropdown-left");
  if (!leftWrap) return;

  const normalizedCats = categories.map(c => typeof c === "string" ? { name: c, icon: "folder" } : c);
  const matchedCat = normalizedCats.find(c => c.name === activeCategory);

  const iconHtml = (activeCategory === "All" || !matchedCat)
    ? getCategoryIconHtml("grid_view")
    : getCategoryIconHtml(matchedCat.icon);
    
  const labelText = activeCategory === "All" ? "Choose Category" : activeCategory;

  leftWrap.innerHTML = `
    ${iconHtml}
    <span id="selectedCategoryLabel">${escapeHtml(labelText)}</span>
  `;
}

function filterCategoryItems(query = "") {
  const listEl = document.querySelector("#categoryItemsList");
  if (!listEl) return;

  const q = String(query || "").trim().toLowerCase();
  const normalizedCats = categories.map(c => typeof c === "string" ? { name: c, icon: "folder" } : c);
  
  const allMatches = !q || "all".includes(q) || "all categories".includes(q) || "choose category".includes(q);
  const matchedCats = normalizedCats.filter(c => !q || c.name.toLowerCase().includes(q));

  if (!allMatches && matchedCats.length === 0) {
    listEl.innerHTML = `<div class="category-no-results">No categories found</div>`;
    return;
  }

  let html = "";
  if (allMatches) {
    const isAllActive = activeCategory === "All";
    html += `
      <button type="button" class="category-item-btn ${isAllActive ? "active" : ""}" data-category="All">
        <div class="category-item-main">
          <span class="category-item-icon">${getCategoryIconHtml("grid_view")}</span>
          <span class="category-item-name">All</span>
        </div>
        ${isAllActive ? `<svg class="category-item-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ""}
      </button>
    `;
  }

  matchedCats.forEach(c => {
    const isActive = activeCategory === c.name;
    html += `
      <button type="button" class="category-item-btn ${isActive ? "active" : ""}" data-category="${escapeHtml(c.name)}">
        <div class="category-item-main">
          <span class="category-item-icon">${getCategoryIconHtml(c.icon)}</span>
          <span class="category-item-name">${escapeHtml(c.name)}</span>
        </div>
        ${isActive ? `<svg class="category-item-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ""}
      </button>
    `;
  });

  listEl.innerHTML = html;

  listEl.querySelectorAll(".category-item-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.category;
      closeCategoryDropdown();
      updateCategoryToggleLabel();
      renderCategoryMenu();
      renderProducts();
    });
  });
}

function renderCategoryMenu() {
  if (!categoryMenuPanel) return;

  updateCategoryToggleLabel();
  filterCategoryItems("");

  const searchInp = document.querySelector("#categorySearchInput");
  if (searchInp && !searchInp.dataset.bound) {
    searchInp.dataset.bound = "true";
    searchInp.addEventListener("input", (e) => {
      filterCategoryItems(e.target.value);
    });
    searchInp.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    searchInp.addEventListener("keydown", (e) => {
      e.stopPropagation();
    });
  }
}

function getSingleVariantStock(v) {
  if (!v) return 0;
  if (v.unlimitedStock) return 999999;
  if (Array.isArray(v.stock)) return v.stock.filter(s => !s.isSold).length;
  if (typeof v.stock === "number") return v.stock;
  if (typeof v.stockCount === "number") return v.stockCount;
  return 0;
}

function getProductStock(product) {
  if (!Array.isArray(product.variants) || product.variants.length === 0) {
    return 0;
  }
  return product.variants.reduce((sum, v) => sum + getSingleVariantStock(v), 0);
}

function renderProducts() {
  if (!grid) return;
  const query = search ? search.value.trim().toLowerCase() : "";
  const filtered = products.filter(product => {
    const matchesCategory = activeCategory === "All" || product.category === activeCategory;
    const matchesSearch = (product.title || "").toLowerCase().includes(query) || (product.category || "").toLowerCase().includes(query) || (product.tags || "").toLowerCase().includes(query);
    return matchesCategory && matchesSearch && !product.isHidden;
  });

  if (countNum) {
    countNum.textContent = filtered.length;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--muted); font-weight:600;">No products found matching your search.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(product => {
    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    const minPrice = hasVariants
      ? Math.min(...product.variants.map(v => Number(v.price) || 0))
      : 0;
    const totalStock = getProductStock(product);
    const inStock = totalStock > 0;

    return `
      <article class="product-card ${!inStock ? 'product-out-of-stock' : ''}">
        <div class="product-card-img-wrap" data-card-product-id="${escapeHtml(product.id)}">
          ${product.image 
            ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" class="product-card-img">`
            : `<div class="product-card-placeholder">${escapeHtml(product.title.slice(0, 2).toUpperCase())}</div>`
          }
        </div>
        <div class="product-card-body">
          <h3 class="product-card-title">${escapeHtml(product.title)}</h3>
          <span class="product-card-stock" style="color: ${inStock ? '#fb923c' : '#f87171'};">
            ${inStock ? `${totalStock >= 9999 ? 'In Stock' : `${totalStock} In Stock`}` : 'Out of Stock'}
          </span>
          <button type="button" class="product-card-btn ${!inStock ? 'disabled-btn' : ''}" data-product-id="${escapeHtml(product.id)}">
            ${inStock ? `Purchase | £${minPrice.toFixed(2)}` : 'Out of Stock'}
          </button>
        </div>
      </article>
    `;
  }).join("");

  // Attach card click handlers to open modal
  grid.querySelectorAll("[data-product-id], [data-card-product-id]").forEach(el => {
    el.addEventListener("click", () => {
      const pid = el.dataset.productId || el.dataset.cardProductId;
      const product = products.find(p => p.id === pid);
      if (product) openPurchaseModal(product);
    });
  });
}

// Purchase Modal Elements
const modalOverlay = document.querySelector("#purchaseModalOverlay");
const closeModalBtn = document.querySelector("#closePurchaseModal");
const modalTitle = document.querySelector("#purchaseModalTitle");
const modalDesc = document.querySelector("#purchaseModalDesc");
const modalTagsLabel = document.querySelector("#purchaseModalTagsLabel");
const modalTags = document.querySelector("#purchaseModalTags");
const variantSelect = document.querySelector("#purchaseModalVariantSelect");
const qtyMinus = document.querySelector("#purchaseQtyMinus");
const qtyPlus = document.querySelector("#purchaseQtyPlus");
const qtyVal = document.querySelector("#purchaseQtyVal");
const modalTotal = document.querySelector("#purchaseModalTotal");
const buyNowBtn = document.querySelector("#purchaseBuyNowBtn");
const addToCartBtn = document.querySelector("#purchaseAddToCartBtn");
const customInputsDiv = document.querySelector("#purchaseModalCustomInputs");

function openPurchaseModal(product) {
  selectedProduct = product;
  selectedQty = 1;
  if (qtyVal) qtyVal.textContent = selectedQty;

  if (modalTitle) modalTitle.textContent = (product.title || "PRODUCT").toUpperCase();
  if (modalDesc) {
    modalDesc.textContent = (product.description && product.description.trim()) ? product.description.toUpperCase() : "24 HOURS WARRANTY. AUTOMATIC INSTANT DELIVERY.";
  }

  // Tags
  if (modalTags) {
    const rawTags = (product.tags || product.category || "").split(",").map(t => t.trim()).filter(Boolean);
    if (rawTags.length > 0) {
      if (modalTagsLabel) modalTagsLabel.style.display = "block";
      modalTags.style.display = "flex";
      modalTags.innerHTML = rawTags.map(t => `<span class="modal-tag-pill">${escapeHtml(t)}</span>`).join("");
    } else {
      if (modalTagsLabel) modalTagsLabel.style.display = "none";
      modalTags.style.display = "none";
      modalTags.innerHTML = "";
    }
  }

  // Variants & Live Stock Sync
  if (variantSelect) {
    const variants = Array.isArray(product.variants) ? product.variants : [];

    if (variants.length === 0) {
      variantSelect.innerHTML = `<option value="" disabled selected>No variants available</option>`;
      selectedVariant = null;
      if (modalTotal) modalTotal.textContent = "£0.00";
      if (buyNowBtn) { buyNowBtn.disabled = true; buyNowBtn.style.opacity = "0.4"; buyNowBtn.style.pointerEvents = "none"; buyNowBtn.textContent = "Out of Stock"; }
      if (addToCartBtn) { addToCartBtn.disabled = true; addToCartBtn.style.opacity = "0.4"; addToCartBtn.style.pointerEvents = "none"; addToCartBtn.textContent = "Out of Stock"; }
    } else {
      variantSelect.innerHTML = variants.map(v => {
        const vStock = getSingleVariantStock(v);
        const isOut = vStock === 0;
        return `
          <option value="${escapeHtml(v.id)}" data-price="${v.price}" data-stock="${vStock}" ${isOut ? 'disabled' : ''}>
            ${escapeHtml(v.name)} - £${Number(v.price).toFixed(2)} (${isOut ? 'Out of Stock' : (vStock >= 9999 ? 'In Stock' : `${vStock} in stock`)})
          </option>
        `;
      }).join("");

      selectedVariant = variants.find(v => getSingleVariantStock(v) > 0) || variants[0];

      variantSelect.value = selectedVariant.id;

      const currentStock = getSingleVariantStock(selectedVariant);
      const isAvailable = currentStock > 0;

      if (buyNowBtn) {
        buyNowBtn.disabled = !isAvailable;
        buyNowBtn.style.opacity = isAvailable ? "1" : "0.4";
        buyNowBtn.style.pointerEvents = isAvailable ? "auto" : "none";
        buyNowBtn.textContent = isAvailable ? "Buy Now" : "Out of Stock";
      }
      if (addToCartBtn) {
        addToCartBtn.disabled = !isAvailable;
        addToCartBtn.style.opacity = isAvailable ? "1" : "0.4";
        addToCartBtn.style.pointerEvents = isAvailable ? "auto" : "none";
        addToCartBtn.textContent = isAvailable ? "Add to Cart" : "Out of Stock";
      }

      variantSelect.onchange = () => {
        selectedVariant = variants.find(v => v.id === variantSelect.value) || variants[0];
        const vStock = getSingleVariantStock(selectedVariant);
        const hasStock = vStock > 0;
        if (buyNowBtn) {
          buyNowBtn.disabled = !hasStock;
          buyNowBtn.style.opacity = hasStock ? "1" : "0.4";
          buyNowBtn.style.pointerEvents = hasStock ? "auto" : "none";
          buyNowBtn.textContent = hasStock ? "Buy Now" : "Out of Stock";
        }
        if (addToCartBtn) {
          addToCartBtn.disabled = !hasStock;
          addToCartBtn.style.opacity = hasStock ? "1" : "0.4";
          addToCartBtn.style.pointerEvents = hasStock ? "auto" : "none";
          addToCartBtn.textContent = hasStock ? "Add to Cart" : "Out of Stock";
        }
        updateModalTotal();
      };
    }
  }

  // Custom Inputs (e.g., custom email/password requirement)
  if (customInputsDiv) {
    let customHtml = "";
    if (product.askEmail) {
      customHtml += `<div class="modal-form-group"><label class="modal-label">Your Email for Delivery</label><input type="email" id="customInputEmail" class="auth-input" placeholder="email@domain.com" required></div>`;
    }
    if (product.askPassword) {
      customHtml += `<div class="modal-form-group"><label class="modal-label">Account Password</label><input type="text" id="customInputPassword" class="auth-input" placeholder="Desired password"></div>`;
    }
    if (product.askDescription) {
      customHtml += `<div class="modal-form-group"><label class="modal-label">Custom Notes / ID</label><input type="text" id="customInputNotes" class="auth-input" placeholder="Additional details"></div>`;
    }
    customInputsDiv.innerHTML = customHtml;
    customInputsDiv.style.display = customHtml ? "flex" : "none";
  }

  updateModalTotal();
  if (modalOverlay) modalOverlay.classList.add("active");
}

function updateModalTotal() {
  if (!selectedVariant || !modalTotal) return;
  const total = Number(selectedVariant.price || 0) * selectedQty;
  modalTotal.textContent = `£${total.toFixed(2)}`;
}

// Stepper
if (qtyMinus && qtyPlus && qtyVal) {
  qtyMinus.addEventListener("click", () => {
    if (selectedQty > 1) {
      selectedQty--;
      qtyVal.textContent = selectedQty;
      updateModalTotal();
    }
  });
  qtyPlus.addEventListener("click", () => {
    selectedQty++;
    qtyVal.textContent = selectedQty;
    updateModalTotal();
  });
}

// Close modal
if (closeModalBtn && modalOverlay) {
  closeModalBtn.addEventListener("click", () => modalOverlay.classList.remove("active"));
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove("active");
  });
}

// Add To Cart Helper
function addCurrentToCart() {
  if (!selectedProduct || !selectedVariant) return false;
  
  let customData = {};
  const emailInput = document.querySelector("#customInputEmail");
  const passInput = document.querySelector("#customInputPassword");
  const notesInput = document.querySelector("#customInputNotes");
  if (emailInput) customData.email = emailInput.value.trim();
  if (passInput) customData.password = passInput.value.trim();
  if (notesInput) customData.notes = notesInput.value.trim();

  const cartItem = {
    id: `${selectedProduct.id}:${selectedVariant.id}`,
    productId: selectedProduct.id,
    variantId: selectedVariant.id,
    name: selectedProduct.title,
    variantName: formatVariantName(selectedVariant.name),
    price: Number(selectedVariant.price),
    quantity: selectedQty,
    image: selectedProduct.image || "",
    customData
  };

  if (typeof window.addToCartStorage === "function") {
    window.addToCartStorage(cartItem);
  } else {
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem("mysterio_cart") || "[]"); } catch (e) {}
    const existing = cart.find(c => c.productId === cartItem.productId && c.variantId === cartItem.variantId);
    if (existing) {
      existing.quantity += cartItem.quantity;
    } else {
      cart.push(cartItem);
    }
    localStorage.setItem("mysterio_cart", JSON.stringify(cart));
    if (typeof window.updateCartBadge === "function") window.updateCartBadge();
  }
  return true;
}

if (addToCartBtn) {
  addToCartBtn.addEventListener("click", () => {
    if (addCurrentToCart()) {
      if (typeof window.updateCartBadge === "function") window.updateCartBadge();

      // Trigger cart button animation
      document.querySelectorAll(".cart-icon-btn").forEach(btn => {
        btn.classList.remove("wiggle");
        void btn.offsetWidth;
        btn.classList.add("wiggle");
      });
      
      const origText = addToCartBtn.textContent;
      addToCartBtn.textContent = "✓ Added to Cart!";
      addToCartBtn.style.background = "#15803d";
      setTimeout(() => {
        addToCartBtn.textContent = origText;
        addToCartBtn.style.background = "#ea580c";
      }, 1600);

      if (typeof showToast === "function") {
        showToast(`Added ${selectedProduct.title} to cart`, true);
      }
    }
  });
}

if (buyNowBtn) {
  buyNowBtn.addEventListener("click", () => {
    if (addCurrentToCart()) {
      if (typeof window.updateCartBadge === "function") window.updateCartBadge();
      window.location.href = "/cart.html";
    }
  });
}

function showGridSkeletonLoading() {
  if (!grid) return;
  grid.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px 0;width:100%;">
      <div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.1);border-top-color:#ea580c;border-radius:50%;animation:spinLoader .6s linear infinite;"></div>
    </div>
    <style>@keyframes spinLoader{to{transform:rotate(360deg)}}</style>
  `;
}

// Initial Data Fetch
async function initStore() {
  checkAuthStatus();
  showGridSkeletonLoading();
  try {
    const [prodRes, catRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/categories")
    ]);
    const prodData = await prodRes.json();
    const catData = await catRes.json();
    products = Array.isArray(prodData) ? prodData : (prodData.products || []);
    categories = Array.isArray(catData) ? catData : (catData.categories || []);
    renderCategoryMenu();
    renderProducts();
  } catch (e) {
    console.error("Error loading products:", e);
  }
}

if (search) {
  search.addEventListener("input", renderProducts);
}

// =========================================================
// FAST FIRE PARTICLES STREAMING FROM FALCON'S BACK
// =========================================================
function initFalconHeroFire() {
  const canvas = document.querySelector("#falconFireCanvas");
  const logo = document.querySelector(".store-hero-logo");
  if (!canvas || !logo) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = window.devicePixelRatio || 1;
  let particles = [];
  let isRunning = true;
  let animId = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (width === 0 || height === 0) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  document.addEventListener("visibilitychange", () => {
    isRunning = !document.hidden;
    if (isRunning && !animId) {
      animId = requestAnimationFrame(loop);
    }
  });

  function getFalconBounds() {
    const logoRect = logo.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return {
      fx: logoRect.left - canvasRect.left,
      fy: logoRect.top - canvasRect.top,
      fw: logoRect.width,
      fh: logoRect.height
    };
  }

  function spawnParticle(bounds) {
    // Contour of falcon's back and wings (strictly behind head/chest)
    const t = Math.random();
    const normX = 0.18 + t * 0.45;
    const normY = 0.11 + Math.pow(t, 1.35) * 0.35;

    const x = bounds.fx + bounds.fw * normX + (Math.random() - 0.5) * 3;
    const y = bounds.fy + bounds.fh * normY + (Math.random() - 0.5) * 2;

    // Laser-straight horizontal trajectory (less than 2 degrees spread)
    const isSupersonic = Math.random() < 0.32;
    const speed = isSupersonic ? (Math.random() * 8.0 + 13.0) : (Math.random() * 6.5 + 7.5); // 7.5 to 21 px/frame
    const angle = Math.PI + (Math.random() - 0.5) * 0.035; // virtually 180 deg straight left
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const maxLife = isSupersonic ? (Math.random() * 12 + 10) : (Math.random() * 18 + 14);
    const size = isSupersonic ? (Math.random() * 1.5 + 1.2) : (Math.random() * 2.8 + 1.5);
    const streakLength = isSupersonic ? (Math.random() * 1.8 + 3.2) : (Math.random() * 1.2 + 2.2);

    return {
      x,
      y,
      vx,
      vy,
      life: 1.0,
      decay: 1.0 / maxLife,
      size,
      streakLength,
      isSupersonic
    };
  }

  function loop() {
    if (!isRunning) {
      animId = null;
      return;
    }

    ctx.clearRect(0, 0, width, height);

    const bounds = getFalconBounds();
    if (bounds.fw > 0 && bounds.fh > 0) {
      // Spawn 3-5 particles every frame for a dense straight fire jet stream
      const spawnCount = Math.floor(Math.random() * 3) + 3;
      for (let i = 0; i < spawnCount; i++) {
        if (particles.length < 110) {
          particles.push(spawnParticle(bounds));
        }
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.988; // minimal drag to maintain high speed straight line
      p.life -= p.decay;

      if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > width || p.y > height) {
        particles.splice(i, 1);
        continue;
      }

      const curSize = p.size * (0.3 + 0.7 * p.life);
      const alpha = Math.min(1, p.life * 1.3);

      // Rich supersonic flame colors
      let r, g, b;
      if (p.life > 0.7) {
        // Blazing core hot yellow/gold
        r = 255;
        g = Math.floor(200 + 40 * p.life);
        b = Math.floor(60 + 70 * p.life);
      } else if (p.life > 0.3) {
        // High-speed Falcon orange
        r = 245;
        g = Math.floor(95 + 65 * ((p.life - 0.3) / 0.4));
        b = 18;
      } else {
        // Trailing ember red
        r = Math.floor(190 + 40 * (p.life / 0.3));
        g = Math.floor(30 + 40 * (p.life / 0.3));
        b = 8;
      }

      // Straight supersonic fire streak (trails strictly behind moving particle)
      const grow = Math.min(1.0, (1.0 - p.life) * 4.0);
      const tailX = p.x - p.vx * p.streakLength * grow;
      const tailY = p.y - p.vy * p.streakLength * grow;

      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tailX, tailY);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.85})`;
      ctx.lineWidth = curSize * (p.isSupersonic ? 0.75 : 0.95);
      ctx.lineCap = "round";
      ctx.stroke();

      // Sharp glowing projectile tip
      ctx.beginPath();
      ctx.arc(p.x, p.y, curSize * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.fill();
    }

    ctx.restore();
    animId = requestAnimationFrame(loop);
  }

  function start() {
    resize();
    if (!animId) animId = requestAnimationFrame(loop);
  }

  if (logo.complete) {
    start();
  } else {
    logo.onload = start;
  }

  window.addEventListener("resize", () => {
    resize();
  });
}

function onReady() {
  initStore();
  initFalconHeroFire();
  if (typeof window.updateCartBadge === "function") window.updateCartBadge();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onReady);
} else {
  onReady();
}

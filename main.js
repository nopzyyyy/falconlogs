const rows = document.querySelector("#inventoryRows");
const binFilter     = document.querySelector("#binFilter");
const bankFilter    = document.querySelector("#bankFilter");
const stateFilter   = document.querySelector("#stateFilter");
const cityFilter    = document.querySelector("#cityFilter");
const countryFilter = document.querySelector("#countryFilter");
const typeFilter    = document.querySelector("#typeFilter");
const levelFilter   = document.querySelector("#levelFilter");
const baseFilter    = document.querySelector("#baseFilter");
const minPriceFilter = document.querySelector("#minPriceFilter");
const maxPriceFilter = document.querySelector("#maxPriceFilter");
const resetFilters  = document.querySelector("#resetFilters");
const cardDetailModal = document.querySelector("#cardDetailModal");
const cardDetailGrid = document.querySelector("#cardDetailGrid");
const cardDetailAddBtn = document.querySelector("#cardDetailAddBtn");
const cardDetailBuyBtn = document.querySelector("#cardDetailBuyBtn");
const closeCardDetailModal = document.querySelector("#closeCardDetailModal");
let allItems = [];
let currentDetailItem = null;

// Country name → ISO 3166-1 alpha-2 code (for flagcdn.com)
const COUNTRY_CODES = {
  "USA": "us", "US": "us", "UNITED STATES": "us", "UNITED STATES OF AMERICA": "us",
  "CANADA": "ca", "CA": "ca",
  "UK": "gb", "GB": "gb", "UNITED KINGDOM": "gb", "GREAT BRITAIN": "gb", "ENGLAND": "gb",
  "AUSTRALIA": "au", "AU": "au",
  "GERMANY": "de", "DE": "de", "DEUTSCHLAND": "de",
  "FRANCE": "fr", "FR": "fr",
  "MEXICO": "mx", "MX": "mx",
  "BRAZIL": "br", "BR": "br",
  "JAPAN": "jp", "JP": "jp",
  "CHINA": "cn", "CN": "cn",
  "INDIA": "in", "IN": "in",
  "RUSSIA": "ru", "RU": "ru",
  "ITALY": "it", "IT": "it",
  "SPAIN": "es", "ES": "es",
  "NETHERLANDS": "nl", "NL": "nl", "HOLLAND": "nl",
  "BELGIUM": "be", "BE": "be",
  "SWEDEN": "se", "SE": "se",
  "NORWAY": "no", "NO": "no",
  "DENMARK": "dk", "DK": "dk",
  "FINLAND": "fi", "FI": "fi",
  "POLAND": "pl", "PL": "pl",
  "PORTUGAL": "pt", "PT": "pt",
  "GREECE": "gr", "GR": "gr",
  "SWITZERLAND": "ch", "CH": "ch",
  "AUSTRIA": "at", "AT": "at",
  "IRELAND": "ie", "IE": "ie",
  "TURKEY": "tr", "TR": "tr",
  "SOUTH KOREA": "kr", "KOREA": "kr", "KR": "kr",
  "SINGAPORE": "sg", "SG": "sg",
  "HONG KONG": "hk", "HK": "hk",
  "TAIWAN": "tw", "TW": "tw",
  "THAILAND": "th", "TH": "th",
  "INDONESIA": "id", "ID": "id",
  "PHILIPPINES": "ph", "PH": "ph",
  "VIETNAM": "vn", "VN": "vn",
  "MALAYSIA": "my", "MY": "my",
  "NEW ZEALAND": "nz", "NZ": "nz",
  "ARGENTINA": "ar", "AR": "ar",
  "CHILE": "cl", "CL": "cl",
  "COLOMBIA": "co", "CO": "co",
  "SOUTH AFRICA": "za", "ZA": "za",
  "EGYPT": "eg", "EG": "eg",
  "UAE": "ae", "AE": "ae", "UNITED ARAB EMIRATES": "ae",
  "SAUDI ARABIA": "sa", "SA": "sa",
  "ISRAEL": "il", "IL": "il",
  "PAKISTAN": "pk", "PK": "pk",
  "BANGLADESH": "bd", "BD": "bd"
};

function countryCode(country) {
  return COUNTRY_CODES[String(country || "").toUpperCase().trim()] || null;
}

function countryFlagHtml(country) {
  const code = countryCode(country);
  const safe = escapeHtml(country || "Unknown");
  if (!code) {
    return `<span class="country-flag country-flag-unknown" title="${safe}" aria-label="${safe}">?</span>`;
  }
  return `<img class="country-flag" src="https://flagcdn.com/w40/${code}.png" srcset="https://flagcdn.com/w80/${code}.png 2x" alt="${safe}" title="${safe}" loading="lazy" onerror="this.outerHTML='<span class=\\'country-flag country-flag-unknown\\' title=\\'${safe}\\'>${code.toUpperCase()}</span>'">`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function renderSkeletonRows(count = 6) {
  const skeletonRow = `
    <tr>
      ${Array.from({ length: 11 }).map(() => `<td><div class="skeleton" style="height: 14px; width: 80%;"></div></td>`).join("")}
    </tr>
  `;
  rows.innerHTML = Array.from({ length: count }).map(() => skeletonRow).join("");
}

function isInCart(itemId) {
  return window.marketCart.read().some(entry => entry.id === itemId);
}

function render(items) {
  const previewRows = document.querySelector("#previewRows");
  if (previewRows) {
    previewRows.textContent = `${items.length} rows`;
  }

  if (!items.length) {
    rows.innerHTML = '<tr><td colspan="11" class="empty">No matching stock found.</td></tr>';
    return;
  }

  rows.innerHTML = items.map(item => {
    const isAdded = isInCart(item.id);
    return `
      <tr data-item-id="${escapeHtml(item.id)}">
        <td class="flag-cell">${countryFlagHtml(item.country)}</td>
        <td title="${escapeHtml(item.bin)}" class="bin-cell">${escapeHtml(item.bin)}</td>
        <td title="${escapeHtml(item.type)}">${escapeHtml(item.type)}</td>
        <td title="${escapeHtml(item.level)}">${escapeHtml(item.level)}</td>
        <td title="${escapeHtml(item.issuer)}">${escapeHtml(item.issuer)}</td>
        <td title="${escapeHtml(item.state)}">${escapeHtml(item.state)}</td>
        <td title="${escapeHtml(item.zip)}">${escapeHtml(item.zip)}</td>
        <td title="${escapeHtml(item.country)}">${escapeHtml(item.country)}</td>
        <td title="${escapeHtml(item.base)}"><span class="base-hot">${escapeHtml(item.base)}</span></td>
        <td>${item.refundable ? '<span class="refund-yes">Yes</span>' : '<span class="refund-no">No</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="add-btn${isAdded ? ' added' : ''}" type="button" data-cart-card="${escapeHtml(item.id)}">${isAdded ? 'Added' : 'Add'}</button>
            <button class="buy-btn" type="button" data-buy-card="${escapeHtml(item.id)}">Buy £${money(item.price)}</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  rows.querySelectorAll(".add-btn").forEach(button => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      handleAddToggle(button);
    });
  });

  rows.querySelectorAll(".buy-btn").forEach(button => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = allItems.find(entry => entry.id === button.dataset.buyCard);
      if (!item) return;

      // Mobile: open the detail popup instead of going straight to cart
      if (window.innerWidth <= 700) {
        openCardDetail(item);
        return;
      }

      button.disabled = true;
      button.innerHTML = `<span class="spinner-sm"></span>`;
      if (!isInCart(item.id)) {
        window.marketCart.add({
          type: "stock",
          id: item.id,
          name: `${item.bin} ${item.type} ${item.level}`,
          price: item.price,
          quantity: 1
        });
      }
      if (window.showPageLoader) window.showPageLoader();
      location.href = "/cart";
    });
  });

  // Clicking a row anywhere opens the detail modal
  rows.querySelectorAll("tr[data-item-id]").forEach(tr => {
    tr.addEventListener("click", () => {
      const item = allItems.find(entry => entry.id === tr.dataset.itemId);
      if (item) openCardDetail(item);
    });
  });
}

function handleAddToggle(button) {
  const itemId = button.dataset.cartCard;
  const item = allItems.find(entry => entry.id === itemId);
  if (!item) return;

  if (button.classList.contains("added")) {
    const cart = window.marketCart.read().filter(entry => entry.id !== itemId);
    window.marketCart.write(cart);
    button.classList.remove("added");
    button.textContent = "Add";
    return;
  }

  window.marketCart.add({
    type: "stock",
    id: item.id,
    name: `${item.bin} ${item.type} ${item.level}`,
    price: item.price,
    quantity: 1
  });
  button.classList.add("added");
  button.textContent = "Added";
}

function openCardDetail(item) {
  currentDetailItem = item;
  const fields = [
    { label: "BIN", value: item.bin, mono: true },
    { label: "Type", value: item.type },
    { label: "Level", value: item.level },
    { label: "Issuer", value: item.issuer, wide: true },
    { label: "State", value: item.state },
    { label: "Zip", value: item.zip, mono: true },
    { label: "Country", value: item.country },
    { label: "Refundable", value: item.refundable ? `Yes · within ${item.refundWindowHours || 24}h of delivery` : "No", green: item.refundable, wide: true },
    { label: "Base", value: item.base, wide: true, green: true },
    { label: "Price", value: `£${money(item.price)}`, green: true }
  ];

  cardDetailGrid.innerHTML = fields.map(field => `
    <div class="detail-field${field.wide ? ' wide' : ''}">
      <span class="label">${field.label}</span>
      <span class="value${field.green ? ' green' : ''}${field.mono ? ' mono' : ''}">${escapeHtml(field.value || '—')}</span>
    </div>
  `).join("");

  const inCart = isInCart(item.id);
  cardDetailAddBtn.classList.toggle("added", inCart);
  cardDetailAddBtn.textContent = inCart ? "Remove from Cart" : "Add to Cart";
  cardDetailBuyBtn.textContent = `Buy Now — £${money(item.price)}`;

  cardDetailModal.classList.add("active");
}

function closeDetailModal() {
  cardDetailModal.classList.remove("active");
  currentDetailItem = null;
}

closeCardDetailModal.addEventListener("click", closeDetailModal);
cardDetailModal.addEventListener("click", (e) => {
  if (e.target === cardDetailModal) closeDetailModal();
});

cardDetailAddBtn.addEventListener("click", () => {
  if (!currentDetailItem) return;
  const itemId = currentDetailItem.id;
  const inCart = isInCart(itemId);

  if (inCart) {
    const cart = window.marketCart.read().filter(entry => entry.id !== itemId);
    window.marketCart.write(cart);
    cardDetailAddBtn.classList.remove("added");
    cardDetailAddBtn.textContent = "Add to Cart";
  } else {
    window.marketCart.add({
      type: "stock",
      id: currentDetailItem.id,
      name: `${currentDetailItem.bin} ${currentDetailItem.type} ${currentDetailItem.level}`,
      price: currentDetailItem.price,
      quantity: 1
    });
    cardDetailAddBtn.classList.add("added");
    cardDetailAddBtn.textContent = "Added to Cart";
  }

  // Sync the row's add button visually
  const rowAddBtn = rows.querySelector(`[data-cart-card="${CSS.escape(itemId)}"]`);
  if (rowAddBtn) {
    if (isInCart(itemId)) {
      rowAddBtn.classList.add("added");
      rowAddBtn.textContent = "Added";
    } else {
      rowAddBtn.classList.remove("added");
      rowAddBtn.textContent = "Add";
    }
  }
});

cardDetailBuyBtn.addEventListener("click", () => {
  if (!currentDetailItem) return;
  cardDetailBuyBtn.disabled = true;
  cardDetailBuyBtn.innerHTML = `<span class="spinner-sm"></span> Redirecting...`;
  if (!isInCart(currentDetailItem.id)) {
    window.marketCart.add({
      type: "stock",
      id: currentDetailItem.id,
      name: `${currentDetailItem.bin} ${currentDetailItem.type} ${currentDetailItem.level}`,
      price: currentDetailItem.price,
      quantity: 1
    });
  }
  if (window.showPageLoader) window.showPageLoader();
  location.href = "/cart";
});

function includesTerm(value, term) {
  return String(value || "").toLowerCase().includes(term);
}

function applyFilters() {
  const binTerm     = binFilter.value.trim().toLowerCase();
  const bankTerm    = bankFilter.value.trim().toLowerCase();
  const stateTerm   = stateFilter.value.trim().toLowerCase();
  const cityTerm    = cityFilter.value.trim().toLowerCase();
  const countryTerm = countryFilter.value.trim().toLowerCase();
  const typeVal     = typeFilter.value;
  const levelVal    = levelFilter.value;
  const baseVal     = baseFilter.value;
  const minPrice    = minPriceFilter.value !== '' ? parseFloat(minPriceFilter.value) : null;
  const maxPrice    = maxPriceFilter.value !== '' ? parseFloat(maxPriceFilter.value) : null;

  const filtered = allItems.filter(item => {
    const price = Number(item.price || 0);
    return (
      includesTerm(item.bin, binTerm) &&
      includesTerm(item.issuer, bankTerm) &&
      includesTerm(item.state, stateTerm) &&
      includesTerm(item.city || item.issuer || item.base, cityTerm) &&
      includesTerm(item.country, countryTerm) &&
      (!typeVal  || String(item.type  || '').toLowerCase() === typeVal.toLowerCase()) &&
      (!levelVal || String(item.level || '').toLowerCase() === levelVal.toLowerCase()) &&
      (!baseVal  || String(item.base  || '') === baseVal) &&
      (minPrice === null || price >= minPrice) &&
      (maxPrice === null || price <= maxPrice)
    );
  });

  render(filtered);
}

function populateSelects(items) {
  const unique = key => [...new Set(items.map(i => i[key]).filter(Boolean))].sort();
  [
    [typeFilter,  unique('type')],
    [levelFilter, unique('level')],
    [baseFilter,  unique('base')],
  ].forEach(([sel, vals]) => {
    const first = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(first);
    vals.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
  });
}

[binFilter, bankFilter, stateFilter, cityFilter, countryFilter, minPriceFilter, maxPriceFilter].forEach(input => {
  input.addEventListener("input", applyFilters);
});

[typeFilter, levelFilter, baseFilter].forEach(sel => {
  sel.addEventListener("change", applyFilters);
});

document.querySelectorAll(".filter-submit").forEach(button => {
  button.addEventListener("click", applyFilters);
});

resetFilters.addEventListener("click", () => {
  binFilter.value     = "";
  bankFilter.value    = "";
  stateFilter.value   = "";
  cityFilter.value    = "";
  countryFilter.value = "";
  typeFilter.value     = "";
  levelFilter.value    = "";
  baseFilter.value     = "";
  minPriceFilter.value = "";
  maxPriceFilter.value = "";
  render(allItems);
});

renderSkeletonRows();
if (window.showPageLoader) window.showPageLoader();

fetch("/api/items")
  .then(response => response.json())
  .then(data => {
    allItems = (data.items || []).filter(item => !item.isSold);
    populateSelects(allItems);
    render(allItems);
    if (window.hidePageLoader) window.hidePageLoader();
  })
  .catch(() => {
    rows.innerHTML = '<tr><td colspan="11" class="empty">Could not load inventory.</td></tr>';
    if (window.hidePageLoader) window.hidePageLoader();
  });

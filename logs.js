// ── Products page ──────────────────────────────────────────────────────────────

const CURRENCY = getCurrencySign();
let allProducts = [];
let currentPage = 1;
const PER_PAGE = 20;
let activeFilters = { title: '', category: '', country: 'ww' };

function isLoggedIn() {
  return window.IS_LOGGED_IN === true;
}

function loginRedirect() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login.html?redirect=${next}`;
}

async function checkAuth() {
  try {
    const r = await fetch('/api/auth/me');
    if (r.ok) {
      const data = await r.json();
      if (data && (data.authenticated === true || data.user)) {
        window.IS_LOGGED_IN = true;
        const user = data.user || data;
        window.CURRENT_USER = user;
        const guestActions = document.getElementById('navGuestActions');
        const authActions = document.getElementById('navAuthActions');
        if (guestActions) guestActions.style.setProperty('display', 'none', 'important');
        if (authActions) authActions.style.setProperty('display', 'flex', 'important');
        document.querySelectorAll('.nav-auth-only').forEach(el => el.style.setProperty('display', 'block', 'important'));
        const balEl = document.getElementById('clientBalance');
        if (balEl) balEl.textContent = `£${Number(user.balance || 0).toFixed(2)}`;
        const acctName = document.getElementById('accountUsername');
        if (acctName) acctName.textContent = user.email ? user.email.split('@')[0] : (user.name || 'user');
        renderProducts();
        return;
      }
    }
  } catch (_) {}
  window.IS_LOGGED_IN = false;
  const guestActions = document.getElementById('navGuestActions');
  const authActions = document.getElementById('navAuthActions');
  if (guestActions) guestActions.style.setProperty('display', 'flex', 'important');
  if (authActions) authActions.style.setProperty('display', 'none', 'important');
  document.querySelectorAll('.nav-auth-only').forEach(el => el.style.setProperty('display', 'none', 'important'));
}

/** Single entry for any buy/add-to-cart action covers all product types now and in the future. */
function handleProductBuy(productId) {
  if (!isLoggedIn()) {
    loginRedirect();
    return;
  }
  openProductModal(productId);
}

function addToCartLabel() {
  return isLoggedIn() ? 'Add to cart' : 'Sign in to buy';
}

// Load categories
async function loadCategories() {
  try {
    const d = await apiFetch('/api/categories');
    const wrapper = document.getElementById('categorySelect');
    const opts = wrapper.querySelector('.custom-options');
    opts.innerHTML = '<div class="custom-option" data-value="">All Categories</div>';
    d.categories.forEach(cat => {
      const el = document.createElement('div');
      el.className = 'custom-option';
      el.dataset.value = cat;
      el.textContent = cat;
      opts.appendChild(el);
    });
  } catch {}
}

// Load products
async function loadProducts() {
  try {
    const params = new URLSearchParams();
    if (activeFilters.title) params.set('title', activeFilters.title);
    if (activeFilters.category) params.set('category', activeFilters.category);
    if (activeFilters.country && activeFilters.country !== 'ww') params.set('country', activeFilters.country);

    const d = await apiFetch('/api/products?' + params);
    allProducts = (d.products || []).filter(p => !p.isHidden);
    document.getElementById('searchBarFound').textContent = allProducts.length;
    currentPage = 1;
    renderProducts();
  } catch (err) {
    console.error(err);
  }
}

// Map our country codes to flagcdn ISO codes
const TWEMOJI_GLOBE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/1f30e.svg';

const COUNTRY_FLAG = {
  ww: 'un',
  global: 'un',
  worldwide: 'un',
  all: 'un',
  usa: 'us',
  us: 'us',
  uk: 'gb',
  gb: 'gb',
  ca: 'ca',
  aus: 'au',
  au: 'au',
  eu: 'eu'
};

const COUNTRY_LABEL = {
  ww: 'Worldwide',
  global: 'Worldwide',
  worldwide: 'Worldwide',
  all: 'Worldwide',
  usa: 'USA',
  us: 'USA',
  uk: 'UK',
  gb: 'UK',
  ca: 'Canada',
  aus: 'Australia',
  au: 'Australia',
  eu: 'Europe'
};

function flagUrl(code) {
  const c = String(code || 'ww').toLowerCase().trim();
  if (c === 'ww' || c === 'global' || c === 'worldwide' || c === 'all' || !c) {
    return TWEMOJI_GLOBE;
  }
  return `https://flagcdn.com/${COUNTRY_FLAG[c] || 'un'}.svg`;
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const filtered = allProducts.filter(p => !p.isHidden);
  const start = (currentPage - 1) * PER_PAGE;
  const page = filtered.slice(start, start + PER_PAGE);

  grid.innerHTML = page.map(p => {
    const flagSrc = flagUrl(p.country);
    const label = COUNTRY_LABEL[String(p.country || '').toLowerCase().trim()] || 'Worldwide';
    return `
    <div class="item" data-productid="${p.id}" onclick="handleProductBuy('${p.id}')">
      <div class="img-top image${p.image_url ? '' : ' no-image'}">
        ${p.image_url
          ? `<img alt="product image" src="${p.image_url}" loading="lazy" onerror="this.parentElement.classList.add('no-image');this.parentElement.innerHTML='<span class=&quot;no-image-letter&quot;>'+'${(p.title || '?').charAt(0).toUpperCase()}'+'</span>'">`
          : `<span class="no-image-letter">${escHtml((p.title || '?').charAt(0).toUpperCase())}</span>`}
      </div>
      <div class="content">
        <h5 class="title">${escHtml(p.title)}</h5>
        <div class="body">
          <div class="d-flex justify-content-between w-100 align-items-center mb-2">
            <img class="card-flag" src="${flagSrc}" alt="${label}" title="${label}">
            <h5 class="m-0">${CURRENCY}${parseFloat(p.min_price || 0).toFixed(2)}</h5>
          </div>
          <button class="btn btn-secondary btn-sm w-100" data-action="addToCart" data-productslug="${p.id}" onclick="event.stopPropagation();handleProductBuy('${p.id}')">
            ${isLoggedIn() ? 'Add to cart' : 'Sign in to buy'}
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  renderPagination();
}

function renderPagination() {
  const total = Math.ceil(allProducts.length / PER_PAGE);
  const ul = document.querySelector('#paginationContainer ul');
  if (!ul) return;
  if (total <= 1) { ul.innerHTML = ''; return; }
  if (currentPage > total) currentPage = total;
  if (currentPage < 1) currentPage = 1;

  ul.innerHTML = Array.from({ length: total }, (_, i) => `
    <li class="page-item">
      <button type="button" class="btn ${i + 1 === currentPage ? 'btn-primary' : 'btn-secondary'}" onclick="goPage(${i + 1})" aria-label="Page ${i + 1}" aria-current="${i + 1 === currentPage ? 'page' : 'false'}">${i + 1}</button>
    </li>
  `).join('');
}

function goPage(n) {
  currentPage = n;
  renderProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Product modal ──────────────────────────────────────────────────────────────

let productModalInstance = null;

function cleanupModalBackdrop() {
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
}

async function openProductModal(productId) {
  if (!isLoggedIn()) {
    loginRedirect();
    return;
  }

  const modal = document.getElementById('productModal');
  if (!productModalInstance) {
    productModalInstance = new bootstrap.Modal(modal);
    modal.addEventListener('hidden.bs.modal', () => {
      cleanupModalBackdrop();
      fcaModalState = null;
    });
  }

  const body = document.getElementById('productModalBody');
  body.innerHTML = '<div class="loading"></div>';
  productModalInstance.show();

  try {
    const d = await apiFetch(`/api/products/${productId}`);
    const { product, options = [] } = d;

    if (product.stock_type === 'fca_folders') {
      regularModalState = null;
      renderFcaProductModal(product, d.fcaFolders || []);
      return;
    }

    regularModalState = {
      options: new Map((options || []).map((o) => [o.id, { stock: o.stock, price: o.price, name: o.name }])),
    };
    fcaModalState = null;

    const optionsHtml = options.map(o => `
      <div class="custom-option" data-value="${o.id}" data-price="${o.price}">
        [${CURRENCY}${o.price.toFixed(2)}] ${escHtml(o.name)}
      </div>
    `).join('');

    const firstOption = options[0];
    const firstPrice = firstOption ? firstOption.price : 0;
    const firstName = firstOption ? firstOption.name : '';

    // Convert multi-line description into a bulleted list. Each non-empty line
    // becomes a <li>. Single-line descriptions render as a plain paragraph.
    const descLines = (product.description || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const descHtml = descLines.length > 1
      ? `<ul class="product-desc-list">${descLines.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>`
      : descLines.length === 1
        ? `<p class="product-desc-single">${escHtml(descLines[0])}</p>`
        : '';

    body.innerHTML = `
      <h5 class="text-center mb-3 fw-semibold">${escHtml(product.title)}</h5>
      ${descHtml ? `<label class="mt-4 mb-2 d-flex">About product</label>${descHtml}` : ''}
      ${(() => {
        // Build the tag list: explicit product.tags (comma-separated) first,
        // falling back to the category as a single tag.
        const tagList = (product.tags || '').split(',').map(t => t.trim()).filter(Boolean);
        if (!tagList.length && product.category) tagList.push(product.category);
        return `
      <label class="mt-4 mb-2 d-flex">Tags</label>
      <div class="product-tags mb-1">${tagList.length
        ? tagList.map(t => `<span class="product-tag">${escHtml(t)}</span>`).join('')
        : '<span class="product-tag-empty">No tags</span>'}</div>`;
      })()}
      <label class="mt-4 mb-2 d-flex">Available options</label>
      <div class="input-group">
        <div class="custom-select-wrapper no-input-group-text" id="options-select">
          <div class="custom-select-display" data-value="${firstOption ? firstOption.id : ''}" data-price="${firstPrice}">${firstOption ? `[${CURRENCY}${firstPrice.toFixed(2)}] ${escHtml(firstName)}` : 'No options'}</div>
          <div class="custom-options">${optionsHtml}</div>
        </div>
      </div>
      <label class="mt-4 mb-2 d-flex">Amount to add</label>
      <div class="input-group">
        <input id="totalQuantity" placeholder="enter amount" type="number" value="" min="1" class="form-control">
        <span class="input-group-text">${CURRENCY}</span>
        <span id="totalAmount" class="input-group-text">${firstPrice.toFixed(2)}</span>
      </div>
      <div class="buttons-container">
        <button class="btn btn-secondary" id="btnAddModal" onclick="addToCartFromModal('${product.id}')">${addToCartLabel()}</button>
        <a href="/cart.html" class="btn btn-primary" aria-label="Cart">
          <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" viewBox="0 0 23 23" fill="none">
            <path d="M3.28174 3.68962C2.78388 3.68962 2.38029 4.09321 2.38029 4.59106C2.38029 5.08892 2.78388 5.49251 3.28174 5.49251V3.68962ZM5.08463 4.59106L5.98238 4.50945C5.94017 4.04513 5.55087 3.68962 5.08463 3.68962V4.59106ZM19.5078 7.29541L20.4002 7.42289C20.4371 7.1642 20.36 6.9022 20.1888 6.70478C20.0176 6.50736 19.7691 6.39396 19.5078 6.39396V7.29541ZM5.33048 7.29541L4.43274 7.37702L5.33048 7.29541ZM17.1557 13.7092L17.2199 14.6083L17.1557 13.7092ZM7.74993 14.381L7.6857 13.4818L7.74993 14.381ZM5.82598 12.7459L4.92824 12.8275L5.82598 12.7459ZM3.28174 5.49251H5.08463V3.68962H3.28174V5.49251ZM7.81415 15.2802L17.2199 14.6083L17.0915 12.81L7.6857 13.4818L7.81415 15.2802ZM19.7044 12.2933L20.4002 7.42289L18.6154 7.16793L17.9196 12.0383L19.7044 12.2933ZM4.18689 4.67268L4.43274 7.37702L6.22823 7.2138L5.98238 4.50945L4.18689 4.67268ZM4.43274 7.37702L4.92824 12.8275L6.72373 12.6643L6.22823 7.2138L4.43274 7.37702ZM19.5078 6.39396H5.33048V8.19686H19.5078V6.39396ZM17.2199 14.6083C18.4898 14.5176 19.5244 13.5536 19.7044 12.2933L17.9196 12.0383C17.8596 12.4584 17.5148 12.7798 17.0915 12.81L17.2199 14.6083ZM7.6857 13.4818C7.19589 13.5168 6.76819 13.1533 6.72373 12.6643L4.92824 12.8275C5.06161 14.2946 6.34473 15.3851 7.81415 15.2802L7.6857 13.4818Z" fill="white"></path>
            <circle cx="8.69039" cy="18.1128" r="0.9014" fill="white" stroke="white" stroke-width="1.8029"/>
            <circle cx="15.9021" cy="18.1128" r="0.9014" fill="white" stroke="white" stroke-width="1.8029"/>
          </svg>
        </a>
      </div>
    `;

    const qtyInput = document.getElementById('totalQuantity');
    qtyInput.addEventListener('input', () => {
      if (qtyInput.value === '') { updateModalTotal(); return; }
      const stock = getSelectedRegularOptionStock();
      let v = parseInt(qtyInput.value, 10);
      if (isNaN(v) || v < 1) { updateModalTotal(); return; }
      if (stock > 0 && v > stock) v = stock;
      if (String(v) !== qtyInput.value) qtyInput.value = v;
      updateModalTotal();
    });

    document.getElementById('options-select').addEventListener('change', () => {
      const stock = getSelectedRegularOptionStock();
      if (stock > 0 && parseInt(qtyInput.value, 10) > stock) qtyInput.value = String(stock);
      updateModalTotal();
    });

  } catch (err) {
    body.innerHTML = `<p class="text-danger">${err.message}</p>`;
  }
}

function updateModalTotal() {
  const qty = parseInt(document.getElementById('totalQuantity')?.value) || 1;
  const sel = document.querySelector('#fca-folder-select .custom-select-display')
    || document.querySelector('#options-select .custom-select-display');
  const price = parseFloat(sel?.dataset.price) || 0;
  const totalEl = document.getElementById('totalAmount');
  if (totalEl) totalEl.textContent = (qty * price).toFixed(2);
}

// In-memory stock maps never written into the DOM (inspect element safe).
let regularModalState = null;
let fcaModalState = null;

function getRegularOptionStock(optionId) {
  if (!regularModalState || !optionId) return 0;
  return regularModalState.options.get(optionId)?.stock ?? 0;
}

function getSelectedRegularOptionStock() {
  const id = document.querySelector('#options-select .custom-select-display')?.dataset.value;
  return getRegularOptionStock(id);
}

function fcaLookupFileStock(folderId, fileId) {
  if (!fcaModalState || !folderId || !fileId) return 0;
  const folder = fcaModalState.folders.find(f => f.id === folderId);
  const file = folder?.files?.find(f => f.id === fileId);
  return Number(file?.stock) || 0;
}

function fcaGetSelection() {
  const folderId = document.querySelector('#fca-folder-select .custom-select-display')?.dataset.value || '';
  const fileId = document.querySelector('#fca-file-select .custom-select-display')?.dataset.value || '';
  return { folderId, fileId, stock: fcaLookupFileStock(folderId, fileId) };
}

function clampFcaQtyToSelectedFile() {
  const qtyInput = document.getElementById('totalQuantity');
  if (!qtyInput || qtyInput.value === '') return;
  const { stock } = fcaGetSelection();
  let v = parseInt(qtyInput.value, 10);
  if (isNaN(v) || v < 1) return;
  if (stock <= 0) { qtyInput.value = ''; updateModalTotal(); return; }
  if (v > stock) qtyInput.value = String(stock);
  updateModalTotal();
}

function renderFcaProductModal(product, folders) {
  regularModalState = null;
  fcaModalState = { folders, productId: product.id };
  const body = document.getElementById('productModalBody');
  const descLines = (product.description || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const descHtml = descLines.length > 1
    ? `<ul class="product-desc-list">${descLines.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>`
    : descLines.length === 1
      ? `<p class="product-desc-single">${escHtml(descLines[0])}</p>`
      : '';

  const tagList = (product.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  if (!tagList.length && product.category) tagList.push(product.category);

  const firstFolder = folders[0];
  const firstFiles = firstFolder?.files || [];
  const firstFile = firstFiles[0];
  const firstPrice = firstFolder ? firstFolder.price : 0;

  const folderOptionsHtml = folders.map(f => `
    <div class="custom-option" data-value="${f.id}" data-price="${f.price}">
      ${escHtml(f.name)}
    </div>
  `).join('');

  function filesHtml(folder) {
    return (folder?.files || []).map(file => `
      <div class="custom-option" data-value="${file.id}">
        ${escHtml(file.display_name)}
      </div>
    `).join('');
  }

  body.innerHTML = `
    <h5 class="text-center mb-3 fw-semibold">${escHtml(product.title)}</h5>
    ${descHtml ? `<label class="mt-4 mb-2 d-flex">About product</label>${descHtml}` : ''}
    <label class="mt-4 mb-2 d-flex">Tags</label>
    <div class="product-tags mb-1">${tagList.length
      ? tagList.map(t => `<span class="product-tag">${escHtml(t)}</span>`).join('')
      : '<span class="product-tag-empty">No tags</span>'}</div>
    <label class="mt-4 mb-2 d-flex">Choose folder</label>
    <div class="input-group">
      <div class="custom-select-wrapper no-input-group-text" id="fca-folder-select">
        <div class="custom-select-display" data-value="${firstFolder ? firstFolder.id : ''}" data-price="${firstPrice}">
          ${firstFolder ? escHtml(firstFolder.name) : 'No folders available'}
        </div>
        <div class="custom-options">${folderOptionsHtml || '<div class="custom-option" data-value="">No folders yet</div>'}</div>
      </div>
    </div>
    <label class="mt-4 mb-2 d-flex">Choose stock file</label>
    <div class="input-group">
      <div class="custom-select-wrapper no-input-group-text" id="fca-file-select">
        <div class="custom-select-display" data-value="${firstFile ? firstFile.id : ''}">
          ${firstFile ? escHtml(firstFile.display_name) : 'No files in folder'}
        </div>
        <div class="custom-options">${filesHtml(firstFolder)}</div>
      </div>
    </div>
    <label class="mt-4 mb-2 d-flex">Amount to add</label>
    <div class="input-group">
      <input id="totalQuantity" placeholder="enter amount" type="number" value="" min="1" class="form-control">
      <span class="input-group-text">${CURRENCY}</span>
      <span id="totalAmount" class="input-group-text">${firstPrice.toFixed(2)}</span>
    </div>
    <div class="buttons-container">
      <button class="btn btn-secondary" id="btnAddModal" onclick="addToCartFromModal('${product.id}')">${addToCartLabel()}</button>
      <a href="/cart.html" class="btn btn-primary" aria-label="Cart">
        <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" viewBox="0 0 23 23" fill="none">
          <path d="M3.28174 3.68962C2.78388 3.68962 2.38029 4.09321 2.38029 4.59106C2.38029 5.08892 2.78388 5.49251 3.28174 5.49251V3.68962ZM5.08463 4.59106L5.98238 4.50945C5.94017 4.04513 5.55087 3.68962 5.08463 3.68962V4.59106ZM19.5078 7.29541L20.4002 7.42289C20.4371 7.1642 20.36 6.9022 20.1888 6.70478C20.0176 6.50736 19.7691 6.39396 19.5078 6.39396V7.29541ZM5.33048 7.29541L4.43274 7.37702L5.33048 7.29541ZM17.1557 13.7092L17.2199 14.6083L17.1557 13.7092ZM7.74993 14.381L7.6857 13.4818L7.74993 14.381ZM5.82598 12.7459L4.92824 12.8275L5.82598 12.7459ZM3.28174 5.49251H5.08463V3.68962H3.28174V5.49251ZM7.81415 15.2802L17.2199 14.6083L17.0915 12.81L7.6857 13.4818L7.81415 15.2802ZM19.7044 12.2933L20.4002 7.42289L18.6154 7.16793L17.9196 12.0383L19.7044 12.2933ZM4.18689 4.67268L4.43274 7.37702L6.22823 7.2138L5.98238 4.50945L4.18689 4.67268ZM4.43274 7.37702L4.92824 12.8275L6.72373 12.6643L6.22823 7.2138L4.43274 7.37702ZM19.5078 6.39396H5.33048V8.19686H19.5078V6.39396ZM17.2199 14.6083C18.4898 14.5176 19.5244 13.5536 19.7044 12.2933L17.9196 12.0383C17.8596 12.4584 17.5148 12.7798 17.0915 12.81L17.2199 14.6083ZM7.6857 13.4818C7.19589 13.5168 6.76819 13.1533 6.72373 12.6643L4.92824 12.8275C5.06161 14.2946 6.34473 15.3851 7.81415 15.2802L7.6857 13.4818Z" fill="white"></path>
          <circle cx="8.69039" cy="18.1128" r="0.9014" fill="white" stroke="white" stroke-width="1.8029"/>
          <circle cx="15.9021" cy="18.1128" r="0.9014" fill="white" stroke="white" stroke-width="1.8029"/>
        </svg>
      </a>
    </div>
  `;

  const qtyInput = document.getElementById('totalQuantity');

  function refreshFileSelect(folderId) {
    const folder = folders.find(f => f.id === folderId);
    const fileSelect = document.getElementById('fca-file-select');
    const display = fileSelect.querySelector('.custom-select-display');
    const opts = fileSelect.querySelector('.custom-options');
    opts.innerHTML = filesHtml(folder);
    const first = folder?.files?.[0];
    display.dataset.value = first ? first.id : '';
    display.textContent = first ? first.display_name : 'No files in folder';
    clampFcaQtyToSelectedFile();
  }

  qtyInput.addEventListener('input', () => {
    if (qtyInput.value === '') { updateModalTotal(); return; }
    const { stock } = fcaGetSelection();
    let v = parseInt(qtyInput.value, 10);
    if (isNaN(v) || v < 1) { updateModalTotal(); return; }
    if (stock > 0 && v > stock) v = stock;
    if (String(v) !== qtyInput.value) qtyInput.value = String(v);
    updateModalTotal();
  });

  document.getElementById('fca-folder-select').addEventListener('change', () => {
    const folderId = document.querySelector('#fca-folder-select .custom-select-display')?.dataset.value;
    const folder = folders.find(f => f.id === folderId);
    refreshFileSelect(folderId);
    const folderDisplay = document.querySelector('#fca-folder-select .custom-select-display');
    if (folder) folderDisplay.dataset.price = folder.price;
    updateModalTotal();
  });

  document.getElementById('fca-file-select').addEventListener('change', () => {
    clampFcaQtyToSelectedFile();
  });
}

async function addToCartFromModal(productId) {
  if (!isLoggedIn()) { loginRedirect(); return; }

  const sel = document.querySelector('#options-select .custom-select-display');
  const optionId = sel?.dataset.value;
  const qty = parseInt(document.getElementById('totalQuantity').value) || 1;

  if (!optionId) { showToast('Please select an option', 'error'); return; }

  const stock = getSelectedRegularOptionStock();
  if (stock > 0 && qty > stock) {
    showToast('Quantity exceeds available stock', 'error');
    return;
  }

  const btn = document.getElementById('btnAddModal');
  btn.textContent = 'Adding...';
  btn.disabled = true;

  try {
    const product = allProducts.find(p => p.id === productId);
    const selectedOpt = regularModalState?.options?.get(optionId);
    if (typeof addToCartStorage === 'function') {
      addToCartStorage({
        productId,
        variantId: optionId,
        title: product?.title || 'Product',
        variantName: selectedOpt?.name || 'Default',
        price: selectedOpt?.price || (product?.min_price || 0),
        quantity: qty,
        image: product?.image || product?.image_url || '',
        category: product?.category || ''
      });
    }
    showToast('Added to cart!', 'success');
    if (typeof updateCartBadge === 'function') {
      updateCartBadge();
    }
    document.querySelectorAll('#cartItemsCount, .cartItemsCount').forEach(cartEl => {
      if (typeof getCart === 'function') {
        const cart = getCart();
        cartEl.textContent = cart.reduce((s, i) => s + (i.quantity || 1), 0);
      }
    });
    btn.textContent = 'Added ✓';
    setTimeout(() => { btn.textContent = 'Add to cart'; btn.disabled = false; }, 2000);
  } catch (err) {
    showToast(err.message, 'error');
    btn.textContent = 'Add to cart';
    btn.disabled = false;
  }
}

// ── Country filter ─────────────────────────────────────────────────────────────

document.querySelectorAll('.country').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.country').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    activeFilters.country = el.dataset.country;
    loadProducts();
  });
});

// ── Search inputs ──────────────────────────────────────────────────────────────

let searchTimer;
document.getElementById('searchTitle')?.addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    activeFilters.title = e.target.value;
    loadProducts();
  }, 300);
});

document.getElementById('categorySelect')?.addEventListener('change', () => {
  const display = document.querySelector('#categorySelect .custom-select-display');
  activeFilters.category = display.dataset.value || '';
  loadProducts();
});

// ── Logout ─────────────────────────────────────────────────────────────────────
document.getElementById('navLogoutBtn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (_) {}
  window.location.reload();
});

// ── Helper ─────────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function initProductsPage() {
  await checkAuth();
  await loadCategories();
  await loadProducts();
  if (typeof updateCartBadge === 'function') updateCartBadge();
}

initProductsPage();

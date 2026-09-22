// Crypto coin data + card rendering (reference grid layout).

let cachedCurrencies = null;
let currenciesLoading = null;

const COIN_ICON_ALIASES = { POL: 'matic', WETH: 'eth', WBTC: 'btc' };

const COIN_COLORS = {
  BTC: '#f7931a', ETH: '#627eea', USDT: '#26a17b', USDC: '#2775ca', BNB: '#f3ba2f',
  LTC: '#345d9d', TRX: '#ef0027', SOL: '#9945ff', DOGE: '#c2a633', XRP: '#23292f',
  DAI: '#f5ac37', SHIB: '#ffa409', XMR: '#ff6600', BCH: '#8dc351', POL: '#8247e5',
  NOT: '#0098ea', DOGS: '#0098ea', TON: '#0098ea', GRAM: '#0098ea',
};

const COIN_DISPLAY_NAMES = {
  BTC: 'Bitcoin', ETH: 'Ethereum', USDT: 'Tether', USDC: 'USD Coin', BNB: 'BNB',
  LTC: 'Litecoin', TRX: 'TRON', SOL: 'Solana', DOGE: 'Dogecoin', XRP: 'Ripple',
  DAI: 'DAI', SHIB: 'Shiba', XMR: 'Monero', BCH: 'Bitcoin Cash', POL: 'Polygon',
  NOT: 'Notcoin', DOGS: 'Dogs', GRAM: 'Gram', TON: 'TON',
};

const NETWORK_PILL = {
  ERC20: 'ETH', BEP20: 'BSC', TRC20: 'TRX', Ethereum: 'ETH', BSC: 'BSC',
  Tron: 'TRX', Polygon: 'POL', TON: 'TON',
};

const NETWORK_BADGE_ICON = {
  ERC20: 'eth', BEP20: 'bnb', Ethereum: 'eth', BSC: 'bnb',
};

function oxCoinIconUrl(currency) {
  const upper = String(currency || '').toUpperCase();
  const slug = (COIN_ICON_ALIASES[upper] || upper).toLowerCase();
  return `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${slug}.svg`;
}

function oxCoinAccent(currency) {
  return COIN_COLORS[String(currency || '').toUpperCase()] || '#ea580c';
}

function getCoinIconUrl(currency) { return oxCoinIconUrl(currency); }
function getCoinAccent(currency) { return oxCoinAccent(currency); }

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function coinDisplayName(currency) {
  return COIN_DISPLAY_NAMES[String(currency || '').toUpperCase()] || String(currency || '').toUpperCase();
}

function networkPill(network) {
  if (!network) return '';
  return NETWORK_PILL[network] || network;
}

function coinTimeEstimate(currency, network) {
  const cur = String(currency || '').toUpperCase();
  const net = String(network || '');
  if (net === 'TRC20' || net === 'Tron' || cur === 'TRX') return { text: '<1 min', fast: true };
  if (net === 'TON' || cur === 'TON' || cur === 'NOT' || cur === 'DOGS') return { text: '<1 min', fast: true };
  if (cur === 'SOL' || net === 'Solana') return { text: '<1 min', fast: true };
  if (cur === 'ETH' || net === 'ERC20' || net === 'Ethereum') return { text: '<1 min', fast: true };
  if (cur === 'BNB' || net === 'BEP20' || net === 'BSC') return { text: '<1 min', fast: true };
  if (cur === 'USDT' || cur === 'USDC' || cur === 'DAI') return { text: '<1 min', fast: true };
  if (cur === 'BCH') return { text: '5-10 min', fast: false };
  if (cur === 'LTC') return { text: '2-8 min', fast: false };
  if (cur === 'BTC') return { text: '2-10 min', fast: false };
  return { text: '2-10 min', fast: false };
}

async function loadOxapayCurrencies() {
  if (cachedCurrencies) return cachedCurrencies;
  if (currenciesLoading) return currenciesLoading;
  currenciesLoading = apiFetch('/api/oxapay/currencies')
    .then((d) => { cachedCurrencies = d.currencies || []; return cachedCurrencies; })
    .finally(() => { currenciesLoading = null; });
  return currenciesLoading;
}

function coinCardLabel(currency) {
  return coinDisplayName(currency);
}

const CLOCK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

function renderCoinCardHtml(coin, index, selectedKey, fiatAmount, currencySign) {
  const key = `${coin.currency}|${coin.network || ''}`;
  const selected = key === selectedKey;
  const name = coinCardLabel(coin.currency);
  const pill = networkPill(coin.network);
  const showPill = pill && pill !== coin.currency;
  const badgeSlug = NETWORK_BADGE_ICON[coin.network];
  const time = coinTimeEstimate(coin.currency, coin.network);
  const fiat = Number(fiatAmount);
  const fiatLine = Number.isFinite(fiat) ? `${currencySign || '£'}${fiat.toFixed(2)}` : '';

  return `
    <button type="button" class="crypto-coin-card${selected ? ' selected' : ''}" role="option" aria-selected="${selected}"
      data-currency="${escHtml(coin.currency)}" data-network="${escHtml(coin.network || '')}"
      style="--i:${index}">
      <span class="crypto-coin-icon-stack">
        <span class="crypto-coin-icon-wrap">
          <img class="crypto-coin-icon" src="${oxCoinIconUrl(coin.currency)}" alt="" loading="lazy"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <span class="crypto-coin-fallback">${escHtml(String(coin.currency).slice(0, 2))}</span>
        </span>
        ${badgeSlug ? `<span class="crypto-coin-net-badge"><img src="${oxCoinIconUrl(badgeSlug)}" alt=""></span>` : ''}
      </span>
      <span class="crypto-coin-name-row">
        <span class="crypto-coin-name">${escHtml(name)}</span>
        ${showPill ? `<span class="crypto-coin-net-pill">${escHtml(pill)}</span>` : ''}
      </span>
      ${fiatLine ? `<span class="crypto-coin-fiat">${escHtml(fiatLine)}</span>` : ''}
      <span class="crypto-coin-time${time.fast ? ' fast' : ''}">${CLOCK_SVG}${escHtml(time.text)}</span>
    </button>`;
}

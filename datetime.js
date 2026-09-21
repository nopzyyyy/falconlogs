const SHOP_TZ = 'Europe/London';

function parseUtcSqlite(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

function formatShopDateTime(value) {
  const d = parseUtcSqlite(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    timeZone: SHOP_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: true,
  });
}

function formatShopDate(value) {
  const d = parseUtcSqlite(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    timeZone: SHOP_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatShopTime(value) {
  const d = parseUtcSqlite(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', {
    timeZone: SHOP_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

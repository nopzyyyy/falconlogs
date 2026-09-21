const fs = require('fs');

const titleMap = {
  'index.html': 'Store - Falcon Logs',
  'cart.html': 'Cart - Falcon Logs',
  'orders.html': 'Orders - Falcon Logs',
  'dashboard.html': 'Dashboard - Falcon Logs',
  'deposit.html': 'Add Balance - Falcon Logs',
  'pay.html': 'Payment - Falcon Logs',
  'login.html': 'Account - Falcon Logs',
  'logs.html': 'Products - Falcon Logs',
  'admin.html': 'Admin - Falcon Logs',
  'god.html': 'God View - Falcon Logs',
  'balance.html': 'Redirecting - Falcon Logs'
};

const faviconTags = '<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=380">\n    <link rel="alternate icon" type="image/png" href="/logo.png">';

fs.readdirSync('.').filter(f => f.endsWith('.html')).forEach(file => {
  let c = fs.readFileSync(file, 'utf8');
  if (titleMap[file]) {
    c = c.replace(/<title>[\s\S]*?<\/title>/i, `<title>${titleMap[file]}</title>`);
  }
  if (c.includes('<link rel="icon"')) {
    c = c.replace(/<link rel="icon"[^>]*>/i, faviconTags);
  } else if (c.includes('</head>')) {
    c = c.replace('</head>', `    ${faviconTags}\n  </head>`);
  }
  fs.writeFileSync(file, c);
  console.log('Updated title and favicon for:', file);
});

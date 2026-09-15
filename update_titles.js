const fs = require('fs');

const titleMap = {
  'index.html': 'Store - Mysterio',
  'cart.html': 'Cart - Mysterio',
  'orders.html': 'Orders - Mysterio',
  'dashboard.html': 'Dashboard - Mysterio',
  'deposit.html': 'Add Balance - Mysterio',
  'pay.html': 'Payment - Mysterio',
  'login.html': 'Account - Mysterio',
  'logs.html': 'Products - Mysterio',
  'faq.html': 'FAQ - Mysterio',
  'tos.html': 'Terms - Mysterio',
  'privacy.html': 'Privacy - Mysterio',
  'admin.html': 'Admin - Mysterio',
  'god.html': 'God View - Mysterio',
  'balance.html': 'Redirecting - Mysterio'
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

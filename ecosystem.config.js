module.exports = {
  apps: [
    {
      name: "mysterio-storefront",
      script: "./server.js",
      env: {
        PORT: 3001,
        NODE_ENV: "production"
      }
    },
    {
      name: "mysterio-gateway-bot",
      script: "./gateway_bot.js"
    },
    {
      name: "mysterio-payments-bot",
      script: "./payments_bot.js"
    },
    {
      name: "mysterio-dashboard-bot",
      script: "./dashboard_bot.js"
    },
    {
      name: "mysterio-success-bot",
      script: "./success_bot.js"
    },
    {
      name: "mysterio-replacement-bot",
      script: "./replacement_bot.js"
    }
  ]
};

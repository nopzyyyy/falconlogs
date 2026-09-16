module.exports = {
  apps: [
    {
      name: "falcon-storefront",
      script: "./server.js",
      env: {
        PORT: 3001,
        NODE_ENV: "production"
      }
    },
    {
      name: "falcon-gateway-bot",
      script: "./gateway_bot.js"
    },
    {
      name: "falcon-payments-bot",
      script: "./payments_bot.js"
    },
    {
      name: "falcon-dashboard-bot",
      script: "./dashboard_bot.js"
    },
    {
      name: "falcon-success-bot",
      script: "./success_bot.js"
    },
    {
      name: "falcon-replacement-bot",
      script: "./replacement_bot.js"
    }
  ]
};

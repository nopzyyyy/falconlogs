module.exports = {
  apps: [
    {
      name: "falcon-storefront",
      script: "./server.js",
      env: {
        PORT: 3001,
        NODE_ENV: "production"
      }
    }
  ]
};

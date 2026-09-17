const packageJson = require("../package.json");

module.exports = {
  API_VERSION: "v1",
  APP_VERSION: packageJson.version,
};

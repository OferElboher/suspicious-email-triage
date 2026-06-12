/**
 * Async startup: fetch secrets from mock AWS Secrets Manager, then boot the HTTP server.
 * Docker CMD uses this instead of server.js so credentials load before any DB connection.
 */
const { loadApplicationSecrets } = require("../src/secrets/loadSecrets");

loadApplicationSecrets()
  .then((info) => {
    // eslint-disable-next-line no-console
    console.log(
      `[secrets] loaded ${info.keyCount} keys via provider=${info.providerName}`
    );
    require("../src/server.js");
  })
  .catch((err) => {
    console.error("[secrets] fatal:", err.message);
    process.exit(1);
  });

/**
 * Node preload: fetch secrets before server.js so JWT and DB env vars exist at listen time.
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

/**
 * This small Node script runs before backend/src/server.js inside Docker.
 *
 * It awaits loadApplicationSecrets from the secrets module, logs how many keys loaded, and only then requires server.js.
 *
 * If secrets cannot be fetched the process exits non-zero so Compose restarts or fails visibly.
 *
 * Local developers running node src/server.js directly must ensure env vars are already set.
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

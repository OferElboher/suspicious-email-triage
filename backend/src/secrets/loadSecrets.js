/**
 * Startup hook: load credentials from the secrets provider before the API reads process.env.
 * Called synchronously from config/runtime.js so every import sees injected values.
 */
const {
  createSecretsProvider,
  applySecretsToProcessEnv,
} = require("./secretsProvider");

/** Tracks whether secrets were loaded (for diagnostics and guardrail tests). */
let secretsLoaded = false;
/** Name of the provider that succeeded (mock-aws, file, etc.). */
let activeProviderName = null;
/** Count of keys injected — never log the values themselves. */
let injectedKeyCount = 0;

/**
 * Load secrets once per process and merge into process.env.
 * @param {{ deploymentEnv?: string, force?: boolean }} [options]
 * @returns {Promise<{ providerName: string, keyCount: number }>}
 */
async function loadApplicationSecrets(options = {}) {
  if (secretsLoaded && !options.force) {
    return { providerName: activeProviderName, keyCount: injectedKeyCount };
  }

  const provider = createSecretsProvider(options);
  const secrets = await provider.load();
  applySecretsToProcessEnv(secrets, { override: true });

  secretsLoaded = true;
  activeProviderName = provider.providerName;
  injectedKeyCount = Object.keys(secrets).length;

  return { providerName: activeProviderName, keyCount: injectedKeyCount };
}

/** Synchronous wrapper used when async top-level await is unavailable (Jest, legacy requires). */
function loadApplicationSecretsSync(deploymentEnv) {
  const prevProvider = process.env.SECRETS_PROVIDER;
  if (!prevProvider) {
    process.env.SECRETS_PROVIDER = "file";
  }
  const { loadSecretsFromFile, resolveSecretsFilePath, applySecretsToProcessEnv: apply } =
    require("./secretsProvider");
  const filePath = resolveSecretsFilePath(deploymentEnv);
  const secrets = loadSecretsFromFile(filePath);
  apply(secrets, { override: true });
  secretsLoaded = true;
  activeProviderName = "file-sync";
  injectedKeyCount = Object.keys(secrets).length;
  return { providerName: activeProviderName, keyCount: injectedKeyCount };
}

function isSecretsLoaded() {
  return secretsLoaded;
}

function getSecretsDiagnostics() {
  return {
    loaded: secretsLoaded,
    providerName: activeProviderName,
    keyCount: injectedKeyCount,
  };
}

module.exports = {
  loadApplicationSecrets,
  loadApplicationSecretsSync,
  isSecretsLoaded,
  getSecretsDiagnostics,
};

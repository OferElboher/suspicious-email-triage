/**
 * HTTP client for mock-verdict-callback dev service (stats + recent webhook payloads).
 *
 * Pattern: same as ingestGatewayClient — Node backend proxies external dev mock for React UI.
 * Technology: Node fetch against MOCK_VERDICT_CALLBACK_URL (Docker network hostname).
 */

/** Base URL for mock verdict callback container. */
function mockCallbackBaseUrl() {
  return (process.env.MOCK_VERDICT_CALLBACK_URL || "http://mock-verdict-callback:4569").replace(
    /\/+$/,
    ""
  );
}

/**
 * Fetch aggregate stats from mock receiver GET /stats.
 * @returns {Promise<object|null>}
 */
async function getMockVerdictCallbackStats() {
  try {
    const response = await fetch(`${mockCallbackBaseUrl()}/stats`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch recent callbacks from mock receiver GET /callbacks.
 * @param {number} limit
 * @returns {Promise<object|null>}
 */
async function getMockVerdictCallbacks(limit = 20) {
  try {
    const response = await fetch(`${mockCallbackBaseUrl()}/callbacks?limit=${limit}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    return null;
  }
}

module.exports = { getMockVerdictCallbackStats, getMockVerdictCallbacks, mockCallbackBaseUrl };

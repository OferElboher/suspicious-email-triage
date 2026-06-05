/** Jest tests for mock commercial LLM provider (OpenAI-compatible fetch). */

jest.mock("../src/lib/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { analyzeReview, llmProvider } = require("../src/llm/llmProvider");

describe("llmProvider", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  test("llmProvider returns disabled when DISABLE_LLM=true", () => {
    process.env.DISABLE_LLM = "true";
    expect(llmProvider()).toBe("disabled");
  });

  test("disabled stub omits verdict so rules are not overwritten", async () => {
    process.env.DISABLE_LLM = "true";
    const result = await analyzeReview({
      _id: "x",
      senderEmail: "a@b.com",
      subject: "hi",
      body: "https://secure-login.example-phish.test",
    });
    expect(result._llmDisabled).toBe(true);
    expect(result.verdict).toBeUndefined();
  });

  test("analyzeReview calls mock commercial chat completions API", async () => {
    process.env.DISABLE_LLM = "false";
    process.env.LLM_PROVIDER = "mock_commercial";
    process.env.LLM_BASE_URL = "http://mock-llm:8090/v1";
    process.env.LLM_API_KEY = "dev-mock-key";

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                verdict: "suspicious",
                recommendedAction: "investigate",
                summary: "mock",
                findings: [],
                followUpQuestions: [],
              }),
            },
          },
        ],
      }),
    });

    const review = {
      _id: "abc",
      senderEmail: "a@b.com",
      subject: "Invoice",
      body: "Pay now",
    };
    const result = await analyzeReview(review);
    expect(result.verdict).toBe("suspicious");
    expect(global.fetch.mock.calls[0][0]).toContain("/chat/completions");
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer dev-mock-key");
  });
});

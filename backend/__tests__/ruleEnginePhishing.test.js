const { runRuleEngine } = require("../src/worker/ruleEngine");

describe("ruleEngine phishing URL hints", () => {
  it("flags secure-login.example-phish.test as likely_phishing", () => {
    const result = runRuleEngine({
      subject: "Account",
      body: "Open https://secure-login.example-phish.test/login",
      senderEmail: "a@b.com",
      links: ["https://secure-login.example-phish.test/login"],
    });
    expect(result.verdict).toBe("likely_phishing");
  });
});

const {
  listPhishingSimulationTemplates,
  pickPhishingSimulationTemplate,
} = require("../src/lib/phishingSimulationTemplates");

describe("phishingSimulationTemplates", () => {
  it("lists four rule_engine demo scenarios", () => {
    const templates = listPhishingSimulationTemplates();
    expect(templates.length).toBe(4);
    expect(templates.map((t) => t.id)).toEqual([
      "url_phishing",
      "credential_phishing",
      "urgent_link",
      "benign_newsletter",
    ]);
  });

  it("pickPhishingSimulationTemplate rotates round-robin", () => {
    expect(pickPhishingSimulationTemplate(1).id).toBe("url_phishing");
    expect(pickPhishingSimulationTemplate(4).id).toBe("benign_newsletter");
    expect(pickPhishingSimulationTemplate(5).id).toBe("url_phishing");
  });
});

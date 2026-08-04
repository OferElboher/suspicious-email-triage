/** Render VerdictDeliveryPanel with mock delivery stats. */
import { render, screen } from "@testing-library/react";
import VerdictDeliveryPanel from "./VerdictDeliveryPanel";

describe("VerdictDeliveryPanel", () => {
  it("shows delivery counts and mock receiver stats", () => {
    render(
      <VerdictDeliveryPanel
        loading={false}
        error=""
        snapshot={{
          delivery: {
            defaultCallbackUrl: "http://mock-verdict-callback:4569/webhook",
            counts: { delivered: 3, failed: 1, skipped: 0 },
          },
          mockReceiver: { total: 3, signatureValid: 3, byVerdict: { suspicious: 2, benign: 1 } },
          mockCallbacks: [
            {
              receivedAt: "2026-08-01T12:00:00Z",
              signatureValid: true,
              payload: { externalMessageId: "ext-1", effectiveVerdict: "suspicious" },
            },
          ],
          simulationTemplates: [{ id: "url_phishing", label: "URL phish", expectedVerdict: "likely_phishing" }],
        }}
      />
    );
    expect(screen.getByTestId("verdict-delivery-panel")).toBeInTheDocument();
    expect(screen.getByText("Outbound verdict delivery")).toBeInTheDocument();
    expect(screen.getByText("ext-1")).toBeInTheDocument();
  });
});

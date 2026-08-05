/** Render VerdictDeliveryPanel with mock delivery stats. */
import { render, screen } from "@testing-library/react";
import VerdictDeliveryPanel from "./VerdictDeliveryPanel";

describe("VerdictDeliveryPanel", () => {
  it("shows delivery counts, registered clients, and mock receiver stats", () => {
    render(
      <VerdictDeliveryPanel
        loading={false}
        error=""
        snapshot={{
          delivery: {
            devFallbackCallbackUrl: "http://mock-verdict-callback:4569/webhook",
            registeredClients: [
              {
                clientId: "dev-mock",
                displayName: "Dev mock SEG",
                callbackUrl: "http://mock-verdict-callback:4569/webhook",
                isActive: true,
              },
            ],
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
    expect(screen.getByText("dev-mock")).toBeInTheDocument();
    expect(screen.getByText(/Registered mail platforms/)).toBeInTheDocument();
  });
});

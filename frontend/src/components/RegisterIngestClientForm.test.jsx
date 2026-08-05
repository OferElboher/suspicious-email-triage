/** RegisterIngestClientForm submits PUT /ingest/clients/:clientId. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RegisterIngestClientForm from "./RegisterIngestClientForm";
import { putJson } from "../api/client";

jest.mock("../api/client", () => ({
  putJson: jest.fn(),
}));

describe("RegisterIngestClientForm", () => {
  it("submits client registration", async () => {
    putJson.mockResolvedValue({
      client: { clientId: "acme-graph", callbackUrl: "https://seg.example/hook" },
    });
    const onRegistered = jest.fn();
    render(<RegisterIngestClientForm onRegistered={onRegistered} />);

    fireEvent.change(screen.getByPlaceholderText("contoso-graph"), {
      target: { value: "acme-graph" },
    });
    fireEvent.change(screen.getByPlaceholderText("Contoso Microsoft Graph adapter"), {
      target: { value: "Acme Graph" },
    });
    fireEvent.change(screen.getByPlaceholderText("https://seg.example.com/v1/triage-verdict"), {
      target: { value: "https://seg.example/hook" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save platform webhook/i }));

    await waitFor(() => {
      expect(putJson).toHaveBeenCalledWith("/ingest/clients/acme-graph", {
        displayName: "Acme Graph",
        callbackUrl: "https://seg.example/hook",
        isActive: true,
      });
    });
    expect(onRegistered).toHaveBeenCalled();
  });
});

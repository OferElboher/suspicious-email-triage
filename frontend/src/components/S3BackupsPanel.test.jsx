import { render, screen, waitFor } from "@testing-library/react";
import S3BackupsPanel from "./S3BackupsPanel";

jest.mock("../api/client", () => ({
  getJson: jest.fn(),
  postJson: jest.fn(),
}));

const { getJson, postJson } = require("../api/client");

describe("S3BackupsPanel", () => {
  beforeEach(() => {
    getJson.mockResolvedValue({
      enabled: true,
      provider: "mock-aws",
      bucket: "triage-dev-backups",
      endpoint: "http://mock-s3:4568",
      summary: {
        objectCount: 1,
        totalSizeLabel: "1.2 KB",
        latestModified: "2026-06-01T12:00:00.000Z",
      },
      recentObjects: [
        { key: "postgres/logical-2026.json", size: 1200, lastModified: "2026-06-01T12:00:00.000Z" },
      ],
    });
  });

  it("loads backup stats and renders summary cards", async () => {
    render(<S3BackupsPanel enabled />);
    expect(screen.getByTestId("s3-backups-panel")).toBeInTheDocument();

    await waitFor(() => {
      expect(getJson).toHaveBeenCalledWith("/ops/backups/stats");
    });

    expect(screen.getByText(/S3 database backups/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/triage-dev-backups/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/postgres\/logical-2026.json/i)).toBeInTheDocument();
  });

  it("returns null when disabled", () => {
    const { container } = render(<S3BackupsPanel enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("runs backup upload on button click", async () => {
    postJson.mockResolvedValue({
      key: "postgres/logical-new.json",
      size: 500,
      createdAt: "2026-06-02T12:00:00.000Z",
    });

    render(<S3BackupsPanel enabled />);
    await waitFor(() => expect(getJson).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Run backup now/i })).not.toBeDisabled();
    });

    screen.getByRole("button", { name: /Run backup now/i }).click();
    await waitFor(() => {
      expect(postJson).toHaveBeenCalledWith("/ops/backups/run", {});
    });
  });
});

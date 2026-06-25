import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ManualReviewSubmitModal from "./ManualReviewSubmitModal";

describe("ManualReviewSubmitModal", () => {
  it("submits structured fields via onSubmit", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    render(
      <ManualReviewSubmitModal
        open
        onClose={onClose}
        onSubmit={onSubmit}
        defaultSenderEmail="analyst@test.com"
        defaultSenderName="Analyst"
      />
    );

    fireEvent.change(screen.getByLabelText(/Subject/i), {
      target: { value: "Test subject" },
    });
    fireEvent.change(screen.getByLabelText(/Body/i), {
      target: { value: "Suspicious body text" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Queue analysis/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Test subject",
          body: "Suspicious body text",
          senderEmail: "analyst@test.com",
        })
      );
    });
  });

  it("closes on Escape key", () => {
    const onClose = jest.fn();
    render(
      <ManualReviewSubmitModal open onClose={onClose} onSubmit={jest.fn()} />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

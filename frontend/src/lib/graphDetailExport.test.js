import { copyGraphDetailText, saveGraphDetailText } from "./graphDetailExport";

describe("graphDetailExport", () => {
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => "blob:mock");
    global.URL.revokeObjectURL = jest.fn();
    navigator.clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
  });

  it("copyGraphDetailText writes to clipboard", async () => {
    await copyGraphDetailText("line1\nline2");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("line1\nline2");
  });

  it("saveGraphDetailText triggers download anchor", () => {
    const click = jest.fn();
    jest.spyOn(document, "createElement").mockReturnValue({
      click,
      set href(v) {
        this._href = v;
      },
      set download(v) {
        this._download = v;
      },
    });
    saveGraphDetailText("export me");
    expect(click).toHaveBeenCalled();
  });
});

import {
  copyGraphDetailText,
  saveGraphDetailText,
  saveGraphDetailTextWithPicker,
} from "./graphDetailExport";

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

  it("saveGraphDetailTextWithPicker uses showSaveFilePicker when available", async () => {
    const write = jest.fn();
    const close = jest.fn();
    window.showSaveFilePicker = jest.fn().mockResolvedValue({
      createWritable: () => Promise.resolve({ write, close }),
    });
    await saveGraphDetailTextWithPicker("export me");
    expect(window.showSaveFilePicker).toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith("export me");
    delete window.showSaveFilePicker;
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

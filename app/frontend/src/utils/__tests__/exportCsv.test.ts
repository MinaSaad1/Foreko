import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { downloadCsv } from "../exportCsv";

describe("downloadCsv", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let capturedBlob: Blob | null = null;

  beforeEach(() => {
    capturedBlob = null;
    createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:mock";
    });
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it("is a no-op on empty rows", () => {
    downloadCsv([], "empty.csv");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  function readBlob(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  it("writes header row + values, triggers download, revokes URL", async () => {
    downloadCsv([{ a: 1, b: "two" }, { a: 3, b: "four" }], "out.csv");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    expect(capturedBlob).not.toBeNull();
    const text = await readBlob(capturedBlob!);
    expect(text).toBe("a,b\n1,two\n3,four");
  });

  it("escapes commas, quotes, and newlines", async () => {
    downloadCsv([{ a: 'he said "hi"', b: "x,y", c: "line1\nline2" }], "q.csv");
    const text = await readBlob(capturedBlob!);
    expect(text).toBe('a,b,c\n"he said ""hi""","x,y","line1\nline2"');
  });
});

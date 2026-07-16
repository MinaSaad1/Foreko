import { describe, expect, it } from "vitest";
import { qualityBand } from "@/utils/qualityScore";

describe("qualityBand", () => {
  it("bands a 0-100 score, not a 0-1 fraction", () => {
    // The regression: the rail treated quality_score as a fraction, so it
    // banded against 0.8 / 0.5. Every real score cleared 0.8 and reported ok,
    // including a catastrophic one.
    expect(qualityBand(3)).toBe("err");
    expect(qualityBand(1)).toBe("err");
    expect(qualityBand(59)).toBe("err");
  });

  it("marks a healthy series ok", () => {
    expect(qualityBand(100)).toBe("ok");
    expect(qualityBand(87)).toBe("ok");
    expect(qualityBand(85)).toBe("ok");
  });

  it("marks a borderline series warn", () => {
    expect(qualityBand(84)).toBe("warn");
    expect(qualityBand(60)).toBe("warn");
  });

  it("agrees with the card at both boundaries", () => {
    // The rail and the card read the same number and must not drift again.
    expect(qualityBand(85)).toBe("ok");
    expect(qualityBand(84.9)).toBe("warn");
    expect(qualityBand(60)).toBe("warn");
    expect(qualityBand(59.9)).toBe("err");
  });
});

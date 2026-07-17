import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { FactorInfluenceChart } from "@/components/FactorInfluenceChart";
import type { FactorStat } from "@/types/factors";

// ECharts paints to canvas, so the only way to assert what a bar says is to
// capture the option it is handed.
const captured: { option?: Record<string, unknown> } = {};
vi.mock("echarts-for-react", () => ({
  default: (props: { option: Record<string, unknown> }) => {
    captured.option = props.option;
    return null;
  },
}));

function factor(overrides: Partial<FactorStat>): FactorStat {
  return {
    name: "marketing_spend_usd",
    kind: "numeric",
    mean: 1,
    std: 1,
    min_value: 0,
    max_value: 2,
    last_value: 1,
    unique_count: null,
    top_category: null,
    correlation: 0.88,
    elasticity: 1,
    influence: 1,
    ...overrides,
  };
}

type BarDatum = { label?: { formatter?: string }; itemStyle?: { borderRadius?: unknown } };

function bars(): BarDatum[] {
  const series = (captured.option?.series ?? []) as { data?: BarDatum[] }[];
  return series[0]?.data ?? [];
}

describe("FactorInfluenceChart", () => {
  it("marks direction with a glyph, not colour alone", () => {
    // The regression: direction was carried only by bar colour, accent for a
    // positive driver and neutral for a negative one. In the light theme those
    // are two dark blues sitting next to each other, and the sign lived only in
    // the tooltip. The page told people to read it by hue.
    render(
      <FactorInfluenceChart
        factors={[
          factor({ name: "price", correlation: -0.5, influence: 0.5 }),
          factor({ name: "spend", correlation: 0.9, influence: 1 }),
        ]}
      />,
    );

    const labels = bars().map((d) => d.label?.formatter ?? "");
    expect(labels.some((l) => l.startsWith("▼"))).toBe(true);
    expect(labels.some((l) => l.startsWith("▲"))).toBe(true);
    // The magnitude still reads.
    expect(labels.every((l) => /\d+\.\d%$/.test(l))).toBe(true);
  });

  it("gives a negative correlation the down glyph", () => {
    render(<FactorInfluenceChart factors={[factor({ correlation: -0.9 })]} />);
    expect(bars()[0].label?.formatter).toBe("▼ 100.0%");
  });

  it("gives a positive correlation the up glyph", () => {
    render(<FactorInfluenceChart factors={[factor({ correlation: 0.9 })]} />);
    expect(bars()[0].label?.formatter).toBe("▲ 100.0%");
  });

  it("keeps bars square", () => {
    render(<FactorInfluenceChart factors={[factor({})]} />);
    expect(bars()[0].itemStyle?.borderRadius).toBe(0);
  });
});

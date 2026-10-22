import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartTooltip, ScoreStatusLegend } from "../chart-parts";
import { ROLE_COLORS, SCORE_STATUS, percent, scoreStatus } from "@/lib/chart-theme";

describe("ChartTooltip", () => {
  it("renders nothing while inactive", () => {
    const { container } = render(<ChartTooltip active={false} payload={[{ dataKey: "score", value: 80 }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the label, a readable series name and the formatted value in ink colors", () => {
    render(
      <ChartTooltip
        active
        label="Mon"
        payload={[{ dataKey: "score", value: 82, color: "#7C3AED" }]}
        names={{ score: "Avg score" }}
        valueFormatter={percent}
      />,
    );
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Avg score")).toBeInTheDocument();
    const value = screen.getByText("82%");
    // Values use text ink, never the series color, so they stay readable.
    expect(value.className).toContain("text-slate-900");
    expect(value.getAttribute("style")).toBeNull();
  });

  it("uses colorFor for the swatch when bars have their own fills", () => {
    const { container } = render(
      <ChartTooltip
        active
        label="Physics"
        payload={[{ dataKey: "score", value: 45, color: "#000000", payload: { score: 45 } }]}
        colorFor={(entry) => SCORE_STATUS[scoreStatus(Number(entry.payload?.score))].color}
      />,
    );
    const swatch = container.querySelector("span[aria-hidden]") as HTMLElement;
    expect(swatch.style.backgroundColor).toBe("rgb(225, 29, 72)"); // #E11D48, "needs work"
  });
});

describe("ScoreStatusLegend", () => {
  it("labels every score band so color is never the only cue", () => {
    render(<ScoreStatusLegend />);
    expect(screen.getByText("Strong (80%+)")).toBeInTheDocument();
    expect(screen.getByText("Fair (60–79%)")).toBeInTheDocument();
    expect(screen.getByText("Needs work (<60%)")).toBeInTheDocument();
  });
});

describe("chart theme", () => {
  it("keeps the existing score thresholds", () => {
    expect(scoreStatus(0)).toBe("needs-work");
    expect(scoreStatus(59)).toBe("needs-work");
    expect(scoreStatus(60)).toBe("fair");
    expect(scoreStatus(79)).toBe("fair");
    expect(scoreStatus(80)).toBe("strong");
    expect(scoreStatus(100)).toBe("strong");
  });

  it("gives every role its own fixed color", () => {
    const colors = Object.values(ROLE_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
    expect(Object.keys(ROLE_COLORS)).toEqual(["Students", "Teachers", "Guardians", "Admins"]);
  });
});

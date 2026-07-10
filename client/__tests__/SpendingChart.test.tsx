import { render } from "@testing-library/react";
import SpendingChart from "../components/SpendingChart";

jest.mock("react-chartjs-2", () => ({
  Bar: (props: { data: { labels: string[]; datasets: { data: number[] }[] } }) => (
    <div
      data-testid="chart"
      data-labels={props.data.labels.join(",")}
      data-values={props.data.datasets[0].data.join(",")}
    />
  ),
}));

describe("SpendingChart", () => {
  it("renders with empty data", () => {
    const { getByTestId } = render(<SpendingChart data={[]} />);
    expect(getByTestId("chart").getAttribute("data-labels")).toBe("");
    expect(getByTestId("chart").getAttribute("data-values")).toBe("");
  });

  it("passes monthly totals through to the chart", () => {
    const { getByTestId } = render(
      <SpendingChart
        data={[
          { label: "Jan", total: 10.5 },
          { label: "Feb", total: 20 },
        ]}
      />
    );
    expect(getByTestId("chart").getAttribute("data-labels")).toBe("Jan,Feb");
    expect(getByTestId("chart").getAttribute("data-values")).toBe("10.5,20");
  });
});

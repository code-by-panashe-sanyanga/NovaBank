import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

// chart.js needs the bits you use registered once
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export default function SpendingChart({
  data,
}: {
  data: { label: string; total: number }[];
}) {
  return (
    <Bar
      height={220}
      data={{
        labels: data.map((d) => d.label),
        datasets: [
          {
            data: data.map((d) => Math.round(d.total * 100) / 100),
            backgroundColor: "rgba(7, 198, 166, 0.75)",
            hoverBackgroundColor: "rgba(2, 160, 136, 1)",
            borderRadius: 8,
            maxBarThickness: 42,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              // show "£1,234.56" instead of a bare number
              label: (ctx) =>
                new Intl.NumberFormat("en-GB", {
                  style: "currency",
                  currency: "GBP",
                }).format(ctx.parsed.y ?? 0),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(128, 128, 128, 0.1)" },
            ticks: { callback: (v) => `£${v}` },
          },
          x: { grid: { display: false } },
        },
      }}
    />
  );
}

"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

interface StatusChartProps {
  counts: { draft: number; active: number; flagged: number; completed: number };
}

export function StatusChart({ counts }: StatusChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: ["Draft", "Active", "Flagged", "Completed"],
        datasets: [
          {
            data: [counts.draft, counts.active, counts.flagged, counts.completed],
            backgroundColor: ["#c3c6d6", "#0052cc", "#ba1a1a", "#146c2e"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { position: "right", labels: { boxWidth: 12, font: { size: 12 } } },
        },
      },
    });

    return () => chartRef.current?.destroy();
  }, [counts]);

  const total = counts.draft + counts.active + counts.flagged + counts.completed;

  return (
    <div style={{ position: "relative", height: "260px" }}>
      {total === 0 ? (
        <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--on-surface-variant)" }}>
          No projects yet.
        </div>
      ) : (
        <canvas ref={canvasRef} />
      )}
    </div>
  );
}

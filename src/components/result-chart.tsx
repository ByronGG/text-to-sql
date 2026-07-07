"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/chart-spec";
import type { QueryResult } from "@/lib/run-query";

const CHART_HEIGHT = 320;

// Measures the container ourselves instead of using Recharts' ResponsiveContainer:
// that component caches a 0-width read when it mounts during a keyed remount (e.g.
// navigating between conversation turns) and never recovers. A plain ResizeObserver
// on our own element always settles to the real width.
function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

// App palette (single fixed theme), used as literal hexes so they resolve
// reliably inside Recharts' SVG output.
const ACCENT = "#b0552a";
const GRID = "#e5e1d8";
const AXIS = "#6e6a61";

const numberFmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });

interface ResultChartProps {
  spec: Exclude<ChartSpec, { kind: "none" }>;
  result: QueryResult;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium text-foreground">{String(label)}</p>
      <p className="font-mono text-muted-foreground">{numberFmt.format(payload[0].value)}</p>
    </div>
  );
}

export function ResultChart({ spec, result }: ResultChartProps) {
  const { ref, width } = useContainerWidth();

  if (spec.kind === "metric") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {spec.metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-border bg-card p-4">
            <p className="truncate font-mono text-xs text-muted-foreground" title={metric.label}>
              {metric.label}
            </p>
            <p className="mt-1 text-2xl font-medium tracking-tight text-foreground">
              {numberFmt.format(metric.value)}
            </p>
          </div>
        ))}
      </div>
    );
  }

  const axisProps = {
    stroke: AXIS,
    tick: { fill: AXIS, fontSize: 11 },
    tickLine: { stroke: GRID },
    axisLine: { stroke: GRID },
  } as const;

  return (
    <div className="rounded-md border border-border p-3">
      <div ref={ref}>
      {width > 0 &&
        (spec.kind === "line" ? (
          <LineChart
            width={width}
            height={CHART_HEIGHT}
            data={result.rows}
            margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          >
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={spec.xKey} {...axisProps} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...axisProps} width={52} tickFormatter={(v) => compactFmt.format(Number(v))} />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey={spec.yKey}
              stroke={ACCENT}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: ACCENT }}
            />
          </LineChart>
        ) : (
          <BarChart
            width={width}
            height={CHART_HEIGHT}
            data={result.rows}
            margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          >
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={spec.xKey} {...axisProps} interval={0} angle={-20} textAnchor="end" height={56} />
            <YAxis {...axisProps} width={52} tickFormatter={(v) => compactFmt.format(Number(v))} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: GRID, fillOpacity: 0.3 }} />
            <Bar dataKey={spec.yKey} fill={ACCENT} radius={[3, 3, 0, 0]} />
          </BarChart>
        ))}
      </div>
    </div>
  );
}

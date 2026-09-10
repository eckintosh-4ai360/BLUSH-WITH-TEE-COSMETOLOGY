"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MARKS, VIZ } from "../../lib/viz";
import { VizTooltip, type SeriesKey } from "./ChartFrame";

const AXIS_TICK = { fill: "var(--viz-axis)", fontSize: 11 };
const HEIGHT = 260;

// Area trend chart for monetary metrics over time.
export function MoneyTrendChart({
  data,
  stacked,
  line,
  format,
}: {
  data: Array<Record<string, string | number>>;
  stacked: SeriesKey[];
  line?: SeriesKey;
  format: (value: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="short"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: VIZ.grid }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={value => format(Number(value))}
        />
        <Tooltip
          cursor={{ fill: VIZ.muted, opacity: 0.25 }}
          content={<VizTooltip format={format} />}
        />
        {stacked.map((series, index) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            stackId="income"
            fill={series.color}
            maxBarSize={MARKS.maxBarSize}
            // 2px gap between segments with rounded terminal edge.
            stroke={VIZ.surface}
            strokeWidth={MARKS.gap}
            radius={index === stacked.length - 1 ? MARKS.columnRadius : undefined}
          />
        ))}
        {line ? (
          <Line
            type="monotone"
            dataKey={line.key}
            name={line.label}
            stroke={line.color}
            strokeWidth={MARKS.lineWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{
              r: MARKS.dotRadius + 1,
              stroke: VIZ.surface,
              strokeWidth: MARKS.gap,
            }}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Vertical bar chart for single-metric time series.
export function SingleColumnChart({
  data,
  dataKey,
  color,
  format,
  labelValues = true,
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  color: string;
  format: (value: number) => string;
  labelValues?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="short"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: VIZ.grid }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={44}
          allowDecimals={false}
          tickFormatter={value => format(Number(value))}
        />
        <Tooltip
          cursor={{ fill: VIZ.muted, opacity: 0.25 }}
          content={<VizTooltip format={format} />}
        />
        <Bar
          dataKey={dataKey}
          fill={color}
          maxBarSize={MARKS.maxBarSize}
          radius={MARKS.columnRadius}
        >
          {labelValues ? (
            <LabelList
              dataKey={dataKey}
              position="top"
              offset={8}
              fill="var(--viz-axis)"
              fontSize={11}
              formatter={(value: number) => (value ? format(value) : "")}
            />
          ) : null}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Horizontal bar chart for categorical metrics.
export function CategoryBarChart({
  data,
  dataKey,
  categoryKey = "label",
  color,
  format,
  height,
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  categoryKey?: string;
  color: string;
  format: (value: number) => string;
  height?: number;
}) {
  const chartHeight = height ?? Math.max(HEIGHT, data.length * 34 + 24);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
      >
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={value => format(Number(value))}
        />
        <YAxis
          type="category"
          dataKey={categoryKey}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={132}
        />
        <Tooltip
          cursor={{ fill: VIZ.muted, opacity: 0.25 }}
          content={<VizTooltip format={format} />}
        />
        <Bar dataKey={dataKey} fill={color} maxBarSize={MARKS.maxBarSize} radius={MARKS.barRadius}>
          <LabelList
            dataKey={dataKey}
            position="right"
            offset={8}
            fill="var(--viz-axis)"
            fontSize={11}
            formatter={(value: number) => (value ? format(value) : "")}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Paired column chart comparing two related series.
export function GroupedBarChart({
  data,
  series,
  categoryKey = "label",
  format,
  height,
}: {
  data: Array<Record<string, string | number>>;
  series: SeriesKey[];
  categoryKey?: string;
  format: (value: number) => string;
  height?: number;
}) {
  const chartHeight = height ?? Math.max(HEIGHT, data.length * 46 + 24);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 48, bottom: 4, left: 4 }}
        barGap={MARKS.gap}
      >
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          tickFormatter={value => format(Number(value))}
        />
        <YAxis
          type="category"
          dataKey={categoryKey}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={132}
        />
        <Tooltip
          cursor={{ fill: VIZ.muted, opacity: 0.25 }}
          content={<VizTooltip format={format} />}
        />
        {series.map(item => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            fill={item.color}
            maxBarSize={MARKS.maxBarSize - 6}
            radius={MARKS.barRadius}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Comparative line chart for opposing stock movements.
export function DualLineChart({
  data,
  series,
  format,
}: {
  data: Array<Record<string, string | number>>;
  series: SeriesKey[];
  format: (value: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="short"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: VIZ.grid }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={48}
          allowDecimals={false}
          tickFormatter={value => format(Number(value))}
        />
        <Tooltip
          cursor={{ stroke: VIZ.muted, strokeWidth: 1 }}
          content={<VizTooltip format={format} />}
        />
        {series.map(item => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            strokeWidth={MARKS.lineWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: MARKS.dotRadius + 1, stroke: VIZ.surface, strokeWidth: MARKS.gap }}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export { Cell };

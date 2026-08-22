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

/**
 * Trend over time with several money series on one shared axis.
 *
 * Income streams stack (they sum to total income); spend rides as a line for
 * comparison. Both are cedis, so one axis is honest - a second scale would
 * invent a relationship that is not in the data.
 */
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
            // A 2px surface gap separates touching segments; only the top
            // segment carries the rounded data-end.
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

/** Single-series columns - one colour, no legend, values on the caps. */
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

/**
 * Horizontal bars for nominal categories.
 *
 * Every bar takes slot 1: the categories have no natural order, so shading
 * them by size would double-encode the length that is already on screen.
 */
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

/** Two series side by side, e.g. applications against enrolments. */
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

/** Stock in against stock out - two lines on a shared unit axis. */
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

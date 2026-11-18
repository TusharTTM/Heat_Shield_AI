import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { CategoryScale, Chart as ChartJS, LinearScale, LineElement, PointElement, Tooltip, type ChartOptions } from 'chart.js'
import { useApp } from '../context/AppContext'
import type { MetricPointView } from '../data/metricDetails'
import type { SimpleRiskLevel } from '../types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

const RISK_COLORS: Record<SimpleRiskLevel, string> = { low: '#2f8a62', moderate: '#d28a23', high: '#d66a2d', extreme: '#bd3f48' }
const LINE_COLOR = '#6c63a8'
const GAP_COLOR = '#aab4bb'

function pointColor(point: MetricPointView): string {
  if (point.value === null) return GAP_COLOR
  return point.risk ? RISK_COLORS[point.risk] : LINE_COLOR
}

export function formatPointValue(value: number | null, unitLabel: string, digits: number): string {
  return value === null ? 'Unavailable' : `${value.toFixed(digits)}${unitLabel === '%' || unitLabel === '°C' || unitLabel === '°F' ? unitLabel : ` ${unitLabel}`}`
}

/**
 * Interactive hourly line chart for one metric day. Missing readings stay
 * gaps (spanGaps false) — never interpolated. The accessible hourly table
 * beside it carries the same data for keyboard and screen-reader users.
 */
export function MetricChart({
  points,
  chartLabel,
  unitLabel,
  summaryLabel,
  digits = 1,
}: {
  points: MetricPointView[]
  chartLabel: string
  unitLabel: string
  summaryLabel: string
  digits?: number
}) {
  const { reducedMotion } = useApp()
  const values = points.map((point) => point.value)
  const data = useMemo(() => ({
    labels: points.map((point) => point.label),
    datasets: [{
      label: `${chartLabel} (${unitLabel})`,
      data: values,
      borderColor: LINE_COLOR,
      backgroundColor: '#ffffff',
      borderWidth: 2.5,
      spanGaps: false,
      pointBackgroundColor: points.map(pointColor),
      pointBorderColor: '#ffffff',
      pointBorderWidth: 1.5,
      pointRadius: 3,
      pointHoverRadius: 6,
      tension: 0.25,
    }],
  }), [points, chartLabel, unitLabel])

  const numeric = values.filter((value): value is number => value !== null)
  const range = numeric.length > 0 ? Math.max(...numeric) - Math.min(...numeric) : 0
  const pad = numeric.length > 0 ? Math.max(range * 0.15, unitLabel === '%' ? 5 : 1) : 1

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion ? false : { duration: 250 },
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#24333d',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        padding: 12,
        cornerRadius: 10,
        callbacks: {
          title: (items) => (items[0] ? points[items[0].dataIndex].label : ''),
          label: (context) => context.parsed.y === null
            ? ` ${chartLabel}: unavailable`
            : ` ${chartLabel}: ${context.parsed.y.toFixed(digits)} ${unitLabel}`,
          afterBody: (items) => {
            const point = items[0] ? points[items[0].dataIndex] : null
            return point?.note ? [` ${point.note}`] : []
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: '#59656f', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        title: { display: true, text: 'Hour of the day', color: '#59656f' },
      },
      y: {
        beginAtZero: unitLabel !== '°C' && unitLabel !== '°F',
        suggestedMin: numeric.length > 0 ? Math.min(...numeric) - pad : undefined,
        suggestedMax: numeric.length > 0 ? Math.max(...numeric) + pad : undefined,
        grid: { color: '#dfe5e9' },
        border: { display: false },
        ticks: { color: '#59656f', font: { size: 11 } },
        title: { display: true, text: unitLabel === chartLabel ? chartLabel : `${chartLabel} (${unitLabel})`, color: '#59656f' },
      },
    },
  }

  const spokenValues = points
    .map((point) => `${point.label}: ${formatPointValue(point.value, unitLabel, digits)}`)
    .join('; ')

  return <div className="chart-container metric-chart" style={{ height: 260 }}>
    <Line
      data={data}
      options={options}
      role="img"
      aria-label={`${summaryLabel} ${chartLabel} chart in ${unitLabel}. ${spokenValues}. Modelled estimates — not official warnings or station observations.`}
    />
  </div>
}

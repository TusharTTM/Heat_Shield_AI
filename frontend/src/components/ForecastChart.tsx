import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { CategoryScale, Chart as ChartJS, LinearScale, LineElement, PointElement, Tooltip, Legend, type ChartOptions } from 'chart.js'
import { useApp } from '../context/AppContext'
import type { ForecastDay } from '../types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

export function ForecastChart({ days, height = 300, source = 'demo' }: { days: ForecastDay[]; height?: number; source?: 'demo' | 'open-meteo' }) {
  const { reducedMotion } = useApp()
  const sourceLabel = source === 'open-meteo' ? 'Open-Meteo model' : 'Demo'
  const hottest = days.reduce((peak, day) => day.max > peak.max ? day : peak)
  const data = useMemo(() => ({
    labels: days.map((day) => day.label.split(',')[0]),
    datasets: [
      {
        label: `${sourceLabel} daily high`,
        data: days.map((day) => day.max),
        borderColor: '#b94d22',
        backgroundColor: '#ffffff',
        pointBackgroundColor: days.map((day) => day.date === hottest.date ? '#9f3f1b' : '#b94d22'),
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        borderWidth: 3,
        pointRadius: days.map((day) => day.date === hottest.date ? 6 : 4),
        pointHoverRadius: 7,
        tension: 0.3,
      },
      {
        label: `${sourceLabel} daily low`,
        data: days.map((day) => day.min),
        borderColor: '#337d86',
        backgroundColor: '#ffffff',
        pointBackgroundColor: '#337d86',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        borderDash: [6, 4],
        tension: 0.3,
      },
    ],
  }), [days, hottest.date, sourceLabel])

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion ? false : { duration: 250 },
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { color: '#52606a', usePointStyle: true, pointStyle: 'line', padding: 20, font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: '#24333d',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        padding: 12,
        cornerRadius: 10,
        displayColors: true,
        callbacks: {
          title: (items) => items[0] ? days[items[0].dataIndex].fullLabel : '',
          label: (context) => ` ${(context.parsed.y ?? 0).toFixed(1)}°C · ${context.dataset.label}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#59656f', font: { size: 12 }, maxRotation: 0, autoSkip: false }, border: { display: false } },
      y: {
        suggestedMin: Math.floor(Math.min(...days.map((day) => day.min)) - 2),
        suggestedMax: Math.ceil(Math.max(...days.map((day) => day.max)) + 2),
        grid: { color: '#dfe5e9' },
        border: { display: false },
        ticks: { color: '#59656f', font: { size: 12 }, callback: (value) => `${value}°` },
      },
    },
  }

  const highs = days.map((day) => `${day.fullLabel}: ${day.max.toFixed(1)} degrees Celsius`).join('; ')
  const lows = days.map((day) => `${day.fullLabel}: ${day.min.toFixed(1)} degrees Celsius`).join('; ')
  const ariaLabel = `Five-day ${sourceLabel} daily high and low temperature chart from ${days[0].fullLabel} to ${days[days.length - 1].fullLabel}. Highs: ${highs}. Lows: ${lows}. ${hottest.fullLabel} is hottest at ${hottest.max.toFixed(1)} degrees Celsius.${source === 'demo' ? ' Not a current forecast.' : ' Weather-model estimates, not AI/ML predictions.'}`

  return <div className="chart-container" style={{ height }}><Line data={data} options={options} role="img" aria-label={ariaLabel} /></div>
}

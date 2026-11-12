import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { CategoryScale, Chart as ChartJS, LinearScale, LineElement, PointElement, Tooltip, type ChartOptions } from 'chart.js'
import { useApp } from '../context/AppContext'
import { europeanAqiCategory, riskFromEuropeanAqi, riskFromUsAqi, usAqiCategory } from '../data/hazards'
import type { AirQualityHour, AirQualityValues, SimpleRiskLevel } from '../types'
import { GLOSSARY_TERMS, TermHelp } from './Comprehension'
import { formatWeatherTime } from './ui'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)
const colors: Record<SimpleRiskLevel, string> = { low: '#2f8a62', moderate: '#d28a23', high: '#d66a2d', extreme: '#bd3f48' }

const metrics: Array<{ key: keyof AirQualityValues; label: string; unit: string; plain: string }> = [
  { key: 'usAqi', label: 'US AQI', unit: 'AQI', plain: '0–500 index scale: 0–50 Good · 51–100 Moderate · 101–150 Unhealthy for Sensitive Groups · 151–200 Unhealthy · 201+ Very Unhealthy/Hazardous.' },
  { key: 'europeanAqi', label: 'European AQI', unit: 'AQI', plain: '0–100+ index scale: 0–20 Good · 21–40 Fair · 41–60 Moderate · 61–80 Poor · 81–100 Very Poor · >100 Extremely Poor.' },
  { key: 'pm2_5', label: 'PM2.5', unit: 'µg/m³', plain: 'Fine inhalable particles (≤2.5 µm) from smoke, vehicle exhaust, and fuel burning. Lower µg/m³ means cleaner air.' },
  { key: 'pm10', label: 'PM10', unit: 'µg/m³', plain: 'Coarser airborne particles (≤10 µm) such as road dust, construction dust, and smoke.' },
  { key: 'carbonMonoxide', label: 'Carbon monoxide (CO)', unit: 'µg/m³', plain: 'Colourless gas produced by incomplete fuel combustion in traffic and engines.' },
  { key: 'nitrogenDioxide', label: 'Nitrogen dioxide (NO₂)', unit: 'µg/m³', plain: 'Reactive gas emitted primarily by road traffic and power/industrial combustion.' },
  { key: 'sulphurDioxide', label: 'Sulphur dioxide (SO₂)', unit: 'µg/m³', plain: 'Irritant gas linked mainly to burning sulphur-containing fuels such as coal and heavy oil.' },
  { key: 'ozone', label: 'Ozone (O₃)', unit: 'µg/m³', plain: 'Ground-level smog gas formed when sunlight reacts with traffic and industrial emissions, often peaking in the afternoon.' },
]

function category(metric: keyof AirQualityValues, value: number): string {
  if (metric === 'usAqi') return usAqiCategory(value)
  if (metric === 'europeanAqi') return europeanAqiCategory(value)
  return 'CAMS pollutant estimate'
}

function pointColor(metric: keyof AirQualityValues, value: number | null): string {
  if (value === null) return '#aab4bb'
  if (metric === 'usAqi') return colors[riskFromUsAqi(value)]
  if (metric === 'europeanAqi') return colors[riskFromEuropeanAqi(value)]
  return '#6c63a8'
}

export function AirQualityChart({ hours }: { hours: AirQualityHour[] }) {
  const { reducedMotion } = useApp()
  const [metric, setMetric] = useState<keyof AirQualityValues>('usAqi')
  const selected = metrics.find((item) => item.key === metric) ?? metrics[0]
  const availableHours = useMemo(() => hours.filter((hour) => hour[metric] !== null), [hours, metric])
  const data = useMemo(() => ({
    labels: hours.map((hour) => hour.label),
    datasets: [{
      label: `Modelled ${selected.label}`,
      data: hours.map((hour) => hour[metric]),
      borderColor: '#6c63a8', backgroundColor: '#ffffff', borderWidth: 2.5, spanGaps: false,
      pointBackgroundColor: hours.map((hour) => pointColor(metric, hour[metric])),
      pointBorderColor: '#ffffff', pointBorderWidth: 1.5, pointRadius: 3, pointHoverRadius: 6, tension: 0.25,
    }],
  }), [hours, metric, selected.label])
  const numericValues = availableHours.map((hour) => hour[metric] as number)
  const suggestedMax = numericValues.length ? Math.max(selected.unit === 'AQI' ? 50 : 10, Math.ceil(Math.max(...numericValues) / (selected.unit === 'AQI' ? 50 : 10)) * (selected.unit === 'AQI' ? 50 : 10)) : 50
  const options: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false, animation: reducedMotion ? false : { duration: 250 },
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#24333d', titleColor: '#ffffff', bodyColor: '#ffffff', padding: 12, cornerRadius: 10,
        callbacks: {
          title: (items) => items[0] ? formatWeatherTime(hours[items[0].dataIndex].modelTime) + ' IST' : '',
          label: (context) => context.parsed.y === null
            ? ` ${selected.label}: unavailable`
            : ` ${selected.label} ${context.parsed.y.toFixed(selected.unit === 'AQI' ? 0 : 1)} ${selected.unit} · ${category(metric, context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: '#59656f', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
      y: { beginAtZero: true, suggestedMax, grid: { color: '#dfe5e9' }, border: { display: false }, ticks: { color: '#59656f', font: { size: 11 } }, title: { display: true, text: `${selected.label} (${selected.unit})`, color: '#59656f' } },
    },
  }
  const values = availableHours.map((hour) => `${formatWeatherTime(hour.modelTime)} IST: ${(hour[metric] as number).toFixed(selected.unit === 'AQI' ? 0 : 1)} ${selected.unit}`).join('; ')
  return <section className="air-quality-outlook" aria-label="Hourly air-quality model outlook">
    <div className="chart-metric-control">
      <div className="chart-metric-label-group">
        <label htmlFor="air-quality-chart-metric">Hourly forecast metric (choose pollutant or index)</label>
        <TermHelp definition={selected.unit === 'AQI' ? GLOSSARY_TERMS.usVsEuAqi : GLOSSARY_TERMS.pm} label={selected.unit === 'AQI' ? 'AQI scales?' : 'What is µg/m³?'} />
      </div>
      <select id="air-quality-chart-metric" value={metric} onChange={(event) => setMetric(event.target.value as keyof AirQualityValues)}>
        {metrics.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
      </select>
    </div>
    <p className="chart-metric-plain"><strong>About {selected.label}:</strong> {selected.plain}</p>
    {availableHours.length === 0
      ? <p className="chart-empty" role="status">Hourly {selected.label} estimates are unavailable for this outlook. Current values may still be shown above.</p>
      : <div className="chart-container air-quality-chart" style={{ height: 250 }}><Line data={data} options={options} role="img" aria-label={`Up to 24-hour Open-Meteo/CAMS modelled ${selected.label} chart. ${values}. These are air-quality model estimates, not CPCB station observations.`} /></div>}
    <details className="hourly-data-details">
      <summary>View hourly {selected.label} values (accessible table)</summary>
      <div className="table-scroll"><table><caption>Open-Meteo/CAMS model estimates · not CPCB observations</caption><thead><tr><th scope="col">Model time (IST)</th><th scope="col">{selected.label} ({selected.unit})</th><th scope="col">Classification</th></tr></thead><tbody>
        {hours.map((hour) => <tr key={hour.modelTime}><td>{formatWeatherTime(hour.modelTime)}</td><td>{hour[metric] === null ? 'Unavailable' : (hour[metric] as number).toFixed(selected.unit === 'AQI' ? 0 : 1)}</td><td>{hour[metric] === null ? 'Unavailable' : category(metric, hour[metric] as number)}</td></tr>)}
      </tbody></table></div>
    </details>
  </section>
}

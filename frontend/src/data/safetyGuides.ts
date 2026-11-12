export interface HazardSafetyGuide {
  id: 'air-quality' | 'flood' | 'cyclone' | 'thunderstorm' | 'drought'
  title: string
  coverage: string
  tips: string[]
  sources: { label: string; url: string }[]
}

export const hazardSafetyGuides: HazardSafetyGuide[] = [
  {
    id: 'air-quality', title: 'Air pollution', coverage: 'Preparedness and US AQI guidance · not a CPCB station assessment',
    tips: [
      'Check current local official/station information as well as model forecasts, especially if you are sensitive to air pollution.',
      'When air quality is unhealthy for sensitive groups, children, older adults, pregnant people, and people with heart or lung disease should reduce prolonged or strenuous outdoor exertion.',
      'During unhealthy or worse conditions, reduce outdoor exposure and choose a cleaner indoor space where possible. Follow local public-health instructions.',
      'Seek professional medical advice for breathing difficulty or other concerning symptoms. A modelled AQI is not an individual diagnosis.',
    ],
    sources: [
      { label: 'US EPA AirNow: AQI basics and health categories', url: 'https://www.airnow.gov/aqi/aqi-basics/' },
      { label: 'Central Pollution Control Board', url: 'https://cpcb.nic.in/' },
    ],
  },
  {
    id: 'flood', title: 'Heavy rainfall and floods', coverage: 'General preparedness only · no flood confirmation or river-level assessment',
    tips: [
      'Follow official evacuation instructions and move to higher, safer ground when directed.',
      'Never walk, swim, or drive through floodwater. The depth, current, and hidden road damage can be impossible to judge.',
      'Avoid electrical equipment, fallen power lines, and contaminated water. Use official updates rather than rumours.',
      'Prepare essential documents, medicines, water, and supplies before conditions become dangerous.',
    ],
    sources: [
      { label: 'NDMA disaster-awareness resources', url: 'https://ndma.gov.in/Resources/awareness' },
      { label: 'Ready.gov: flood safety', url: 'https://www.ready.gov/floods' },
    ],
  },
  {
    id: 'cyclone', title: 'Cyclones and severe storms', coverage: 'General preparedness only · no cyclone track or official warning is generated',
    tips: [
      'Follow IMD and local-authority bulletins. Do not rely on an independently generated track or social-media rumour.',
      'Prepare emergency supplies, important documents, medicines, lighting, and a family communication plan.',
      'Evacuate to a designated shelter when instructed, taking vulnerable people and essential supplies with you.',
      'Stay away from dangerous coastal areas, fallen power lines, damaged buildings, and flooded roads. Return only after official all-clear instructions.',
    ],
    sources: [{ label: 'NDMA: cyclone preparedness and response', url: 'https://ndma.gov.in/Resources/awareness/cyclone' }],
  },
  {
    id: 'thunderstorm', title: 'Thunderstorms and lightning', coverage: 'General preparedness only · no lightning-strike prediction',
    tips: [
      'Move indoors when thunder is heard and remain there during the storm. Follow official local warnings.',
      'Avoid open fields, isolated trees, water, and elevated exposed places. Do not shelter under a lone tree.',
      'Avoid contact with electrical equipment, corded devices, and plumbing during lightning where official guidance advises this.',
      'People struck by lightning carry no electrical charge. Arrange emergency medical help and follow professional first-aid guidance.',
    ],
    sources: [{ label: 'NDMA/NIDM: thunderstorm and lightning guidelines', url: 'https://nidm.gov.in/PDF/pubs/NDMA/23.pdf' }],
  },
  {
    id: 'drought', title: 'Drought and prolonged dry conditions', coverage: 'General preparedness only · no drought classification without a historical baseline',
    tips: [
      'Follow local water restrictions and government agricultural/public-health advisories.',
      'Reduce avoidable water waste while maintaining safe drinking, cooking, and hygiene practices.',
      'Protect vulnerable people from heat and plan essential water needs without creating unsafe storage conditions.',
      'Do not infer drought from one hot or dry forecast. Official assessments use longer-term rainfall and environmental baselines.',
    ],
    sources: [{ label: 'NDMA disaster-awareness resources', url: 'https://ndma.gov.in/Resources/awareness' }],
  },
]

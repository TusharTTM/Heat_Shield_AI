import type { SimpleRiskLevel } from '../types'

export const riskRecommendations: Record<SimpleRiskLevel, string> = {
  low: 'Enjoy your day, but keep water with you and use shade when needed.',
  moderate: 'Take breaks in the shade and drink water regularly, especially if you are outdoors.',
  high: 'Avoid direct sunlight from noon to 4 PM. Drink water regularly and check on people who may need help.',
  extreme: 'Stay in a cool indoor place as much as possible. Avoid outdoor activity and check on vulnerable people.',
}

export const safetyTips = [
  {
    id: 'hydration',
    title: 'Drink enough water',
    text: 'Drink water regularly, even if you do not feel thirsty. Follow any fluid limits given by your doctor.',
  },
  {
    id: 'shade',
    title: 'Avoid peak afternoon sun',
    text: 'Stay out of direct sunlight from noon to 4 PM when possible. Choose shade or a cool indoor place.',
  },
  {
    id: 'clothing',
    title: 'Wear lightweight clothing',
    text: 'Choose loose, lightweight and light-coloured clothes. Use a hat or umbrella when outdoors.',
  },
  {
    id: 'community',
    title: 'Check on other people',
    text: 'Check on children, older people and anyone who is ill, working outdoors or may need extra help.',
  },
  {
    id: 'medical-help',
    title: 'Know when to get help',
    text: 'Confusion, fainting, seizures or a very high body temperature can be signs of heatstroke: get emergency help. For heat exhaustion, seek medical help if vomiting occurs, symptoms worsen, or symptoms last longer than 1 hour.',
  },
] as const

export const guidanceSources = [
  {
    label: 'NWS: Understanding heat index',
    url: 'https://www.weather.gov/safety/heat-tools',
    description: 'How humidity affects how hot it feels, and why direct sunshine can increase heat stress.',
  },
  {
    label: 'NWS: Heat safety',
    url: 'https://www.weather.gov/safety/heat',
    description: 'General precautions and people who may need extra support during hot weather.',
  },
  {
    label: 'NWS: Heat illness and first aid',
    url: 'https://www.weather.gov/safety/heat-illness',
    description: 'Warning signs, when to seek medical help, and emergency heatstroke response.',
  },
] as const

import type { Region } from '../types'

/** Geographic reference coordinates only; these are not weather observations. */
export const regions: Region[] = [
  { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777 },
  { slug: 'south-mumbai', name: 'South Mumbai', state: 'Maharashtra', latitude: 18.922, longitude: 72.8347 },
  { slug: 'thane', name: 'Thane', state: 'Maharashtra', latitude: 19.2183, longitude: 72.9781 },
  { slug: 'navi-mumbai', name: 'Navi Mumbai', state: 'Maharashtra', latitude: 19.033, longitude: 73.0297 },
  { slug: 'pune', name: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567 },
  { slug: 'ahmedabad', name: 'Ahmedabad', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714 },
  { slug: 'delhi', name: 'Delhi', state: 'Delhi', latitude: 28.6139, longitude: 77.209 },
  { slug: 'jaipur', name: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873 },
  { slug: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462 },
  { slug: 'bhopal', name: 'Bhopal', state: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126 },
  { slug: 'hyderabad', name: 'Hyderabad', state: 'Telangana', latitude: 17.385, longitude: 78.4867 },
  { slug: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946 },
  { slug: 'chennai', name: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707 },
  { slug: 'kochi', name: 'Kochi', state: 'Kerala', latitude: 9.9312, longitude: 76.2673 },
  { slug: 'kolkata', name: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639 },
]

export function getRegion(slug: string): Region {
  return regions.find((region) => region.slug === slug) ?? regions[0]
}

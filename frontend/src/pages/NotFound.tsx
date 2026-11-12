import { ArrowLeft, MapPinOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui'

export default function NotFound() {
  return <div className="page not-found"><EmptyState icon={<MapPinOff size={30} />} title="Page not found" description="The address may be incorrect. Use the navigation or return to the simplified homepage." action={<Link to="/" className="button button-primary"><ArrowLeft size={17} aria-hidden="true" />Back to Home</Link>} /></div>
}

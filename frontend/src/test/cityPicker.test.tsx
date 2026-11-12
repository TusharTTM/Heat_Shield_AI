import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CityPicker } from '../components/CityPicker'
import { AppProvider } from '../context/AppContext'

function renderPicker() {
  return render(<AppProvider><CityPicker /></AppProvider>)
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
})

describe('searchable city picker', () => {
  it('filters by city or state and persists a shared selection', async () => {
    const user = userEvent.setup()
    renderPicker()
    const trigger = screen.getByRole('button', { name: 'Location: Mumbai' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Choose a location' })).toBeInTheDocument()
    const search = screen.getByRole('searchbox', { name: 'Search cities or states' })
    await waitFor(() => expect(search).toHaveFocus())
    expect(within(screen.getByRole('list', { name: 'Predefined locations' })).getAllByRole('button')).toHaveLength(15)
    expect(screen.getByRole('button', { name: 'Mumbai Maharashtra' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('15 locations · scroll for more')

    await user.type(search, 'west bengal')
    expect(screen.getByRole('status')).toHaveTextContent(/^1 location$/)
    expect(screen.queryByRole('button', { name: 'Mumbai Maharashtra' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear city search' }))
    await user.type(search, 'bengaluru')
    await user.click(screen.getByRole('button', { name: 'Bengaluru Karnataka' }))

    expect(screen.queryByRole('dialog', { name: 'Choose a location' })).not.toBeInTheDocument()
    const selectedTrigger = screen.getByRole('button', { name: 'Location: Bengaluru' })
    expect(selectedTrigger).toHaveFocus()
    expect(selectedTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(JSON.parse(localStorage.getItem('hs-region') ?? '')).toBe('bengaluru')
  })

  it('supports arrow keys, Home, End, and Escape with reliable focus', async () => {
    const user = userEvent.setup()
    renderPicker()
    const trigger = screen.getByRole('button', { name: 'Location: Mumbai' })
    await user.tab()
    expect(trigger).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search cities or states' })).toHaveFocus())
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('button', { name: 'Kolkata West Bengal' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: 'Mumbai Maharashtra' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: 'South Mumbai Maharashtra' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('button', { name: 'Kolkata West Bengal' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('button', { name: 'Mumbai Maharashtra' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('explains empty results without suggesting arbitrary-city support', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(screen.getByRole('button', { name: 'Location: Mumbai' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search cities or states' }), 'Paris')
    expect(screen.getByText('No matching city')).toBeInTheDocument()
    expect(screen.getByText(/Only the 15 predefined locations are available/i)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Predefined locations' })).not.toBeInTheDocument()
  })

  it('closes on outside press and through its close button', async () => {
    const user = userEvent.setup()
    render(<AppProvider><CityPicker /><button type="button">Outside action</button></AppProvider>)
    const trigger = screen.getByRole('button', { name: 'Location: Mumbai' })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Close city picker' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Outside action' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Outside action' })).toHaveFocus()
  })
})

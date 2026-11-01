import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

function Counter() {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>Clicked {n}</button>
}

describe('web test infrastructure', () => {
  it('renders with jsdom and Testing Library', async () => {
    render(<Counter />)
    await userEvent.click(screen.getByRole('button', { name: 'Clicked 0' }))
    expect(screen.getByRole('button')).toHaveTextContent('Clicked 1')
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false)
  })
})

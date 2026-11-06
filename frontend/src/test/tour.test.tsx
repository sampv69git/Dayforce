import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Tour, type TourStep } from '@/components/tour/Tour'
import { canAutoStart, markTourDone } from '@/lib/tour'

const steps: TourStep[] = [
  { title: 'Welcome', body: 'First step' },
  { target: 'thing', title: 'The thing', body: 'Second step' },
  { title: 'Done', body: 'Last step' },
]

function Harness({ onClose }: { onClose: (completed: boolean) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <div data-tour="thing">Target</div>
      <Tour
        steps={steps}
        open={open}
        label="Test tour"
        onClose={(c) => {
          setOpen(false)
          onClose(c)
        }}
      />
    </>
  )
}

describe('Tour', () => {
  it('walks forward and back with buttons and arrow keys, then completes', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: /Test tour: Welcome/ })).toBeInTheDocument()
    expect(screen.getByText('1 of 3', { exact: false })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByRole('dialog', { name: /The thing/ })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByRole('dialog', { name: /Welcome/ })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog', { name: /Done/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('closes without completing on Escape', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledWith(false)
  })
})

describe('tour auto-start', () => {
  beforeEach(() => localStorage.clear())

  it('starts once, then not again after it is marked done', () => {
    expect(canAutoStart('k')).toBe(true)
    markTourDone('k')
    expect(canAutoStart('k')).toBe(false)
  })

  it('never auto-starts under browser automation', () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    expect(canAutoStart('k')).toBe(false)
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  })
})

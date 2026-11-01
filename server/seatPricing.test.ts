import { describe, expect, it } from 'vitest'
import { tierOfRow, tierPrice, tierStep } from './seatPricing'
import { buildSeatLayout } from './api/seats/generate'

describe('cinema seat pricing', () => {
  it('front is cheapest, back costs more, balcony most; free stays free', () => {
    expect(tierStep(1000)).toBe(250)
    expect([0, 1, 2].map((t) => tierPrice(1000, t as 0 | 1 | 2))).toEqual([1000, 1250, 1500])
    expect([0, 1, 2].map((t) => tierPrice(0, t as 0 | 1 | 2))).toEqual([0, 0, 0])
    expect(tierStep(15)).toBe(10) // never a zero step on a paid event
  })

  it('splits rows into thirds the same way the seat map does (ceil)', () => {
    expect(Array.from({ length: 10 }, (_, i) => tierOfRow(i, 10))).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2])
    expect(Array.from({ length: 12 }, (_, i) => tierOfRow(i, 12))).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2])
  })

  it('admin seat generation prices rows cinema-style', () => {
    const { seats, rows } = buildSeatLayout({ customLayout: true, numberOfRows: 9, numberOfColumns: 2 }, 500)
    const priceOf = (row: string) => seats.find((s) => s.row === row)!.price
    expect(priceOf(rows[0]!)).toBe(500) // front (nearest the screen) = base
    expect(priceOf(rows[4]!)).toBe(630) // middle = base + step (step 130)
    expect(priceOf(rows[8]!)).toBe(760) // back/balcony = base + 2 step
    expect(priceOf(rows[0]!)).toBeLessThan(priceOf(rows[4]!))
    expect(priceOf(rows[4]!)).toBeLessThan(priceOf(rows[8]!))
  })

  it('a free event generates only free seats', () => {
    const { seats } = buildSeatLayout({ customLayout: true, numberOfRows: 6, numberOfColumns: 3 }, 0)
    expect(seats.every((s) => s.price === 0)).toBe(true)
  })
})

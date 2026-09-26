import assert from 'node:assert/strict'
import test from 'node:test'
import type { Repeat } from '../store/useTasksStore.ts'
import { advanceRepeat } from './taskRepeat.ts'

function completeTimes(dueDate: string, repeat: Repeat, times: number): string[] {
  const dates: string[] = []
  let current = { dueDate, repeat }
  for (let i = 0; i < times; i += 1) {
    current = advanceRepeat(current.dueDate, current.repeat)
    dates.push(current.dueDate)
  }
  return dates
}

test('monthly tasks on the 31st return to month end after short months', () => {
  assert.deepEqual(completeTimes('2026-01-31', { freq: 'monthly', interval: 1 }, 4), [
    '2026-02-28',
    '2026-03-31',
    '2026-04-30',
    '2026-05-31',
  ])
})

test('yearly tasks on Feb 29 come back on leap years', () => {
  assert.deepEqual(completeTimes('2024-02-29', { freq: 'yearly', interval: 1 }, 4), [
    '2025-02-28',
    '2026-02-28',
    '2027-02-28',
    '2028-02-29',
  ])
})

test('daily and weekly tasks advance by their interval', () => {
  assert.deepEqual(completeTimes('2026-09-26', { freq: 'daily', interval: 2 }, 2), [
    '2026-09-28',
    '2026-09-30',
  ])
  assert.deepEqual(completeTimes('2026-09-26', { freq: 'weekly', interval: 1 }, 1), ['2026-10-03'])
})

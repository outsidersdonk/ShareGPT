import assert from 'node:assert/strict'
import test from 'node:test'
import type { CalendarEvent, RecurrenceFreq } from '../store/useCalendarStore.ts'
import { expandEvent } from './recurrence.ts'

function recurring(start: string, end: string, freq: RecurrenceFreq, interval = 1): CalendarEvent {
  return {
    id: 'e1',
    calendarId: 'c1',
    title: 'repeat',
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    allDay: false,
    recurrence: { freq, interval },
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  } as CalendarEvent
}

test('daily events that started years ago still appear in the visible range', () => {
  const event = recurring('2023-09-01T09:00:00', '2023-09-01T09:30:00', 'DAILY')
  const occurrences = expandEvent(
    event,
    new Date('2026-09-21T00:00:00'),
    new Date('2026-09-27T23:59:59'),
  )
  assert.equal(occurrences.length, 7)
  assert.equal(new Date(occurrences[0].start).getDate(), 21)
  assert.equal(new Date(occurrences[0].start).getHours(), 9)
})

test('monthly events on the 31st clamp to month end without drifting', () => {
  const event = recurring('2026-01-31T10:00:00', '2026-01-31T11:00:00', 'MONTHLY')
  const days = expandEvent(event, new Date('2026-01-01'), new Date('2026-08-31T23:59:59')).map(
    (occ) => new Date(occ.start).getDate(),
  )
  assert.deepEqual(days, [31, 28, 31, 30, 31, 30, 31, 31])
})

test('interval and long durations still overlap the range start', () => {
  const everyOtherWeek = recurring('2024-01-01T08:00:00', '2024-01-01T09:00:00', 'WEEKLY', 2)
  const weeks = expandEvent(everyOtherWeek, new Date('2026-09-01'), new Date('2026-09-30T23:59:59'))
  assert.ok(weeks.length >= 2 && weeks.length <= 3)
  for (const occ of weeks) assert.equal(new Date(occ.start).getDay(), 1)

  const threeDayEvent = recurring('2025-01-10T00:00:00', '2025-01-13T00:00:00', 'MONTHLY')
  const spanning = expandEvent(
    threeDayEvent,
    new Date('2026-03-12'),
    new Date('2026-03-12T23:59:59'),
  )
  assert.equal(spanning.length, 1)
  assert.equal(new Date(spanning[0].start).getDate(), 10)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { parseIcs } from './ics.ts'

function oneEvent(...lines: string[]) {
  const text = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:Meeting', ...lines, 'END:VEVENT']
  return parseIcs([...text, 'END:VCALENDAR'].join('\r\n'))[0]
}

test('DTSTART with an IANA TZID is converted from that zone', () => {
  const ev = oneEvent(
    'DTSTART;TZID=America/New_York:20260315T090000',
    'DTEND;TZID="America/New_York":20260315T100000',
  )
  assert.equal(ev.start, '2026-03-15T13:00:00.000Z')
  assert.equal(ev.end, '2026-03-15T14:00:00.000Z')
})

test('TZID conversion follows daylight saving time', () => {
  const winter = oneEvent('DTSTART;TZID=Europe/Berlin:20260110T090000')
  const summer = oneEvent('DTSTART;TZID=Europe/Berlin:20260710T090000')
  assert.equal(winter.start, '2026-01-10T08:00:00.000Z')
  assert.equal(summer.start, '2026-07-10T07:00:00.000Z')
})

test('UTC times and unknown TZIDs keep their previous meaning', () => {
  assert.equal(oneEvent('DTSTART:20260315T090000Z').start, '2026-03-15T09:00:00.000Z')
  const unknown = oneEvent('DTSTART;TZID=Not A Zone:20260315T090000')
  assert.equal(unknown.start, new Date(2026, 2, 15, 9, 0, 0).toISOString())
})

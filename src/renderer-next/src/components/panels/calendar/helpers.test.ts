import assert from 'node:assert/strict'
import test from 'node:test'
import { hourLabel } from '../../../lib/i18n.ts'
import { periodLabel, weekdayLabels } from './helpers.ts'

const day = new Date(2026, 8, 26)

test('Chinese calendar keeps Monday-first headers and Chinese dates', () => {
  assert.equal(weekdayLabels('zh')[0], '周一')
  assert.equal(periodLabel(day, 'month', 'zh'), '2026年 9月')
  assert.equal(hourLabel(9, 'zh'), '09:00')
})

test('English calendar uses Sunday-first headers, US dates and 12-hour times', () => {
  assert.deepEqual(weekdayLabels('en'), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  assert.equal(periodLabel(day, 'month', 'en'), 'September 2026')
  assert.equal(periodLabel(day, 'day', 'en'), 'Saturday, September 26, 2026')
  assert.equal(hourLabel(0, 'en'), '12 AM')
  assert.equal(hourLabel(13, 'en'), '1 PM')
})

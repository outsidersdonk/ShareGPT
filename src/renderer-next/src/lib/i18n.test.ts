import assert from 'node:assert/strict'
import test from 'node:test'
import { builtinName, LANGUAGE_OPTIONS, normalizeLanguage, pick, weekStartsOn } from './i18n.ts'

test('Chinese is the default and first language, English second', () => {
  assert.deepEqual(
    LANGUAGE_OPTIONS.map((o) => o.value),
    ['zh', 'en'],
  )
  assert.equal(normalizeLanguage(undefined), 'zh')
  assert.equal(normalizeLanguage('fr'), 'zh')
  assert.equal(normalizeLanguage('en'), 'en')
})

test('pick and calendar week start follow the language', () => {
  assert.equal(pick('zh', '账户', 'Account'), '账户')
  assert.equal(pick('en', '账户', 'Account'), 'Account')
  assert.equal(weekStartsOn('zh'), 1)
  assert.equal(weekStartsOn('en'), 0)
})

test('only app-created default names are shown translated', () => {
  assert.equal(builtinName('个人', true, 'en'), 'Personal')
  assert.equal(builtinName('收件箱', true, 'en'), 'Inbox')
  assert.equal(builtinName('个人', true, 'zh'), '个人')
  assert.equal(builtinName('个人', false, 'en'), '个人')
  assert.equal(builtinName('Work', true, 'en'), 'Work')
})

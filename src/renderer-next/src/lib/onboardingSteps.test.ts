import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOnboardingSteps } from './onboardingSteps.ts'

test('onboarding points optional modules to account settings without opening them', () => {
  const steps = buildOnboardingSteps('ShareGPT')
  assert.deepEqual(
    steps.map((step) => step.target),
    [undefined, 'nav-service', 'nav-chat', 'nav-gpt', 'nav-stats', 'nav-account', undefined],
  )
  const discovery = steps.find((step) => step.target === 'nav-account')
  assert.equal(discovery?.title, '更多功能可以在这里发掘')
  assert.match(discovery?.body ?? '', /账户 → 界面设置/)
  assert.match(discovery?.body ?? '', /不会替你开启/)
})

test('English onboarding keeps the same tour targets', () => {
  const zh = buildOnboardingSteps('ShareGPT')
  const en = buildOnboardingSteps('ShareGPT', 'en')
  assert.deepEqual(
    en.map((step) => step.target),
    zh.map((step) => step.target),
  )
  assert.equal(en[0].title, 'Welcome to ShareGPT 👋')
  assert.match(en.find((step) => step.target === 'nav-account')?.body ?? '', /Account → Interface/)
})

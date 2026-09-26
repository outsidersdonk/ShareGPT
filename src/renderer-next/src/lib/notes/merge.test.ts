import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeVault } from './merge.ts'

const COPY = 'a (云端冲突副本).md'

test('a first conflict keeps local text and stores the cloud text as a copy', () => {
  const r = mergeVault({ 'a.md': 'line\nv1' }, { 'a.md': 'line\nlocal' }, { 'a.md': 'line\ncloud' })
  assert.equal(r.merged['a.md'], 'line\nlocal')
  assert.equal(r.merged[COPY], 'line\ncloud')
  assert.deepEqual(r.conflicts, [{ path: 'a.md', copyPath: COPY }])
})

test('a repeated conflict never overwrites an existing conflict copy', () => {
  const r = mergeVault(
    { 'a.md': 'line\nv1', [COPY]: 'old cloud copy' },
    { 'a.md': 'line\nlocal-v2', [COPY]: 'old cloud copy' },
    { 'a.md': 'line\ncloud-v2', [COPY]: 'old cloud copy' },
  )
  assert.equal(r.merged['a.md'], 'line\nlocal-v2')
  assert.equal(r.merged[COPY], 'old cloud copy')
  assert.equal(r.merged['a (云端冲突副本 2).md'], 'line\ncloud-v2')
  assert.deepEqual(r.conflicts, [{ path: 'a.md', copyPath: 'a (云端冲突副本 2).md' }])
})

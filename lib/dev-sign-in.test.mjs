import assert from 'node:assert/strict'
import test from 'node:test'
import { devSignInTarget, safeNextPath } from './dev-sign-in.ts'

const env = { NODE_ENV: 'development', DEV_SIGN_IN_EMAIL: 'agent@example.test', DEV_SIGN_IN_PASSWORD: 'x' }

test('the dev sign-in works only in development, on this machine, with the account configured', () => {
  assert.deepEqual(devSignInTarget(env, 'localhost:3000'), { email: 'agent@example.test', password: 'x' })
  assert.deepEqual(devSignInTarget(env, '127.0.0.1:3000'), { email: 'agent@example.test', password: 'x' })
  assert.equal(devSignInTarget({ ...env, NODE_ENV: 'production' }, 'localhost:3000'), null, 'never in a production build')
  assert.equal(devSignInTarget(env, 'ordly-sevastian-bahynskyis-projects.vercel.app'), null, 'never on another host')
  assert.equal(devSignInTarget(env, 'localhost.evil.com'), null)
  assert.equal(devSignInTarget({ ...env, DEV_SIGN_IN_PASSWORD: '' }, 'localhost:3000'), null, 'nothing configured, nothing happens')
})

test('the redirect after sign-in stays inside the app', () => {
  assert.equal(safeNextPath('/words?kind=phrases'), '/words?kind=phrases')
  assert.equal(safeNextPath(null), '/')
  assert.equal(safeNextPath('https://evil.example'), '/')
  assert.equal(safeNextPath('//evil.example'), '/')
  assert.equal(safeNextPath('/\\evil.example'), '/')
})

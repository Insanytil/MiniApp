import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function moduleUrl(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  for (const [specifier, url] of Object.entries(imports))
    outputText = outputText.replaceAll(`'${specifier}'`, JSON.stringify(url))
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
}

const clientUrl = await moduleUrl('../src/lib/api/client.ts')
const apiSource = `import { createApiClient } from ${JSON.stringify(clientUrl)}; export const api = createApiClient({ baseUrl: '/api', readCookie: () => '' });`
const apiUrl = `data:text/javascript;base64,${Buffer.from(apiSource).toString('base64')}`
const linksUrl = await moduleUrl('../src/features/auth/password-links.ts', {
  '@tanstack/react-query': import.meta.resolve('@tanstack/react-query'),
  zod: import.meta.resolve('zod'),
  '@/lib/api': apiUrl,
  '@/lib/api/client': clientUrl,
})
const { api } = await import(apiUrl)
const { ApiError } = await import(clientUrl)
const {
  parsePasswordLinkSearch,
  isValidPasswordToken,
  passwordFormSchema,
  passwordLinkQuery,
  acceptPasswordLink,
  isExpiredPasswordLink,
  passwordLinkError,
} = await import(linksUrl)
const token = 'valid_token_for_testing_1234567890'
const password = 'Une longue phrase de passe !'

test('URL parsing tolerates missing and malformed search values', () => {
  assert.deepEqual(parsePasswordLinkSearch({}), { token: undefined })
  assert.deepEqual(parsePasswordLinkSearch({ token: [token] }), {
    token: undefined,
  })
  assert.deepEqual(parsePasswordLinkSearch({ token }), { token })
})

test('missing and malformed tokens never enable an API lookup', () => {
  for (const value of [
    undefined,
    '',
    'short',
    'a'.repeat(257),
    'a'.repeat(20) + '/other',
  ]) {
    assert.equal(isValidPasswordToken(value), false)
    assert.equal(passwordLinkQuery('activation', value).enabled, false)
  }
  assert.equal(isValidPasswordToken(token), true)
})

test('password and confirmation must match, with at least 15 characters', () => {
  assert.equal(
    passwordFormSchema.safeParse({ password: 'short', confirmation: 'short' })
      .success,
    false,
  )
  const mismatch = passwordFormSchema.safeParse({
    password,
    confirmation: `${password}x`,
  })
  assert.equal(mismatch.success, false)
  assert.deepEqual(mismatch.error.issues[0].path, ['confirmation'])
  assert.equal(
    passwordFormSchema.safeParse({ password, confirmation: password }).success,
    true,
  )
})

test('password validation counts Unicode characters like Python and keeps spaces', () => {
  assert.equal(
    passwordFormSchema.safeParse({
      password: '🧩'.repeat(8),
      confirmation: '🧩'.repeat(8),
    }).success,
    false,
  )
  assert.equal(
    passwordFormSchema.safeParse({
      password: '🧩'.repeat(15),
      confirmation: '🧩'.repeat(15),
    }).success,
    true,
  )
  const spaced = `  ${password}  `
  assert.equal(
    passwordFormSchema.parse({ password: spaced, confirmation: spaced })
      .password,
    spaced,
  )
  assert.equal(
    passwordFormSchema.safeParse({
      password: spaced,
      confirmation: spaced.trim(),
    }).success,
    false,
  )
  assert.equal(
    passwordFormSchema.safeParse({
      password: 'a'.repeat(1025),
      confirmation: 'a'.repeat(1025),
    }).success,
    false,
  )
})

for (const [kind, endpoint] of [
  ['activation', 'invitations'],
  ['reset', 'password-resets'],
]) {
  test(`${kind}: lookup verifies the token without consuming it`, async (t) => {
    const info = {
      email: 'person@example.com',
      expires_at: '2030-01-01T00:00:00Z',
    }
    t.mock.method(globalThis, 'fetch', async () => Response.json(info))
    const options = passwordLinkQuery(kind, token)
    const signal = new AbortController().signal
    assert.deepEqual(await options.queryFn({ signal }), info)
    const [url, init] = fetch.mock.calls[0].arguments
    assert.equal(url, `/api/auth/${endpoint}/${token}`)
    assert.equal(init.method, 'GET')
    assert.equal(init.signal, signal)
    assert.equal(init.body, undefined)
  })

  test(`${kind}: acceptance sends only the token and new password`, async (t) => {
    t.mock.method(
      globalThis,
      'fetch',
      async () => new Response(null, { status: 204 }),
    )
    assert.equal(await acceptPasswordLink(kind, token, password), undefined)
    const [url, init] = fetch.mock.calls[0].arguments
    assert.equal(url, `/api/auth/${endpoint}/accept`)
    assert.equal(init.method, 'POST')
    assert.deepEqual(JSON.parse(init.body), { token, password })
  })
}

test('invalid tokens cannot submit a new password', (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Must not fetch'))
  assert.throws(() => acceptPasswordLink('reset', 'invalid', password))
})

test('expired and already-used links have a distinct, actionable message', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ detail: 'Invalid or expired' }, { status: 404 }),
  )
  await assert.rejects(
    acceptPasswordLink('reset', token, password),
    (error) => {
      assert.equal(isExpiredPasswordLink(error), true)
      assert.match(passwordLinkError(error), /expiré.*utilisé/)
      return true
    },
  )
})

test('server outages are not confused with expired links', () => {
  const error = new ApiError(503, 'Serveur indisponible')
  assert.equal(isExpiredPasswordLink(error), false)
  assert.equal(passwordLinkError(error), 'Serveur indisponible')
})

test('token operations never invalidate an unrelated authenticated session', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({}, { status: 401 }),
  )
  api.setUnauthorizedHandler(() =>
    assert.fail('Token operations must not log out another account'),
  )
  await assert.rejects(
    passwordLinkQuery('activation', token).queryFn({
      signal: new AbortController().signal,
    }),
  )
  await assert.rejects(acceptPasswordLink('reset', token, password))
})

test('token lookups are isolated, discarded on unmount, and not automatically retried', () => {
  const activation = passwordLinkQuery('activation', token)
  assert.notDeepEqual(
    activation.queryKey,
    passwordLinkQuery('reset', token).queryKey,
  )
  assert.notDeepEqual(
    activation.queryKey,
    passwordLinkQuery('activation', token + 'new').queryKey,
  )
  assert.equal(activation.retry, false)
  assert.equal(activation.gcTime, 0)
  assert.equal(activation.refetchOnWindowFocus, false)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadTypeScript(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  )
}

const { createApiClient, ApiError, readCookieValue } = await loadTypeScript(
  '../src/lib/api/client.ts',
)
const {
  resolveOrganization,
  organizationQueryKey,
  readOrganizationSelection,
  saveOrganizationSelection,
  clearOrganizationSelection,
} = await loadTypeScript('../src/features/organizations/selection.ts')

function setup(t, cookie = 'miniapp_csrf=csrf-secret') {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return new Response(null, { status: 204 })
  })
  return {
    calls,
    client: createApiClient({ baseUrl: '/api/', readCookie: () => cookie }),
  }
}

test('mutations send JSON, session cookies and CSRF; 204 has no JSON body', async (t) => {
  const { client, calls } = setup(t)
  assert.equal(
    await client.request('/auth/logout', {
      method: 'POST',
      body: { all: true },
    }),
    undefined,
  )
  assert.equal(calls[0].url, '/api/auth/logout')
  assert.equal(calls[0].options.credentials, 'include')
  assert.equal(calls[0].options.headers.get('X-CSRF-Token'), 'csrf-secret')
  assert.equal(calls[0].options.headers.get('Content-Type'), 'application/json')
  assert.equal(calls[0].options.body, '{"all":true}')
})

test('GET does not send a CSRF header and forwards the AbortSignal', async (t) => {
  const { client, calls } = setup(t)
  const signal = new AbortController().signal
  await client.request('/auth/me', { signal })
  assert.equal(calls[0].options.headers.has('X-CSRF-Token'), false)
  assert.equal(calls[0].options.signal, signal)
})

test('supports configurable CSRF names', async (t) => {
  setup(t)
  const client = createApiClient({
    baseUrl: '/api',
    csrfCookieName: 'custom',
    csrfHeaderName: 'X-Custom',
    readCookie: () => 'custom=secret',
  })
  await client.request('/resource', { method: 'PATCH' })
  assert.equal(
    fetch.mock.calls[0].arguments[1].headers.get('X-Custom'),
    'secret',
  )
})

test('organization header is scoped explicitly and changes with selection', async (t) => {
  const { client, calls } = setup(t)
  client.setOrganization('org-a')
  await client.request('/auth/me')
  await client.request('/entities', { organizationScoped: true })
  client.setOrganization('org-b')
  await client.request('/entities', { organizationScoped: true })
  assert.equal(calls[0].options.headers.has('X-Organization-ID'), false)
  assert.equal(calls[1].options.headers.get('X-Organization-ID'), 'org-a')
  assert.equal(calls[2].options.headers.get('X-Organization-ID'), 'org-b')
})

test('organization-scoped requests fail before fetch without an active organization', async (t) => {
  const { client, calls } = setup(t)
  await assert.rejects(
    client.request('/entities', { organizationScoped: true }),
    /organisation/,
  )
  assert.equal(calls.length, 0)
})

test('protected 401 notifies session expiry; bad credentials do not', async (t) => {
  const { client } = setup(t)
  fetch.mock.mockImplementation(async () =>
    Response.json({ detail: 'Unauthorized' }, { status: 401 }),
  )
  let expired = 0
  client.setUnauthorizedHandler(() => expired++)
  await assert.rejects(
    client.request('/auth/me'),
    (error) => error instanceof ApiError && error.status === 401,
  )
  await assert.rejects(
    client.request('/auth/login', { method: 'POST', authenticated: false }),
  )
  assert.equal(expired, 1)
})

test('403 preserves the session and exposes a typed error', async (t) => {
  const { client } = setup(t)
  fetch.mock.mockImplementation(async () =>
    Response.json({ detail: 'Forbidden' }, { status: 403 }),
  )
  client.setUnauthorizedHandler(() => assert.fail('403 must not log out'))
  await assert.rejects(
    client.request('/entities'),
    (error) => error.status === 403 && /droits/.test(error.message),
  )
})

test('validation errors retain field details from FastAPI', async (t) => {
  const { client } = setup(t)
  const issues = [{ field: 'email', message: 'Invalid email' }]
  fetch.mock.mockImplementation(async () =>
    Response.json(
      { detail: 'Invalid request data', errors: issues },
      { status: 422 },
    ),
  )
  await assert.rejects(client.request('/users'), (error) => {
    assert.equal(error.status, 422)
    assert.deepEqual(error.issues, issues)
    return true
  })
})

test('network/server outages are not treated as anonymous sessions', async (t) => {
  const { client } = setup(t)
  client.setUnauthorizedHandler(() => assert.fail('outages must not log out'))
  fetch.mock.mockImplementation(async () => {
    throw new TypeError('network')
  })
  await assert.rejects(
    client.request('/auth/me'),
    (error) => error.status === 0,
  )
  fetch.mock.mockImplementation(
    async () => new Response('Bad gateway', { status: 502 }),
  )
  await assert.rejects(
    client.request('/auth/me'),
    (error) => error.status === 502,
  )
})

test('external URLs are rejected before sending authentication headers', async (t) => {
  const { client, calls } = setup(t)
  await assert.rejects(client.request('https://example.com'))
  await assert.rejects(client.request('//example.com'))
  assert.equal(calls.length, 0)
})

test('cookie parsing handles encoded values and malformed cookies', () => {
  assert.equal(
    readCookieValue('other=x; miniapp_csrf=a%2Bb', 'miniapp_csrf'),
    'a+b',
  )
  assert.equal(readCookieValue('miniapp_csrf=%', 'miniapp_csrf'), undefined)
  assert.equal(readCookieValue('', 'miniapp_csrf'), undefined)
})

const orgA = { id: 'a', name: 'A', role: 'organization_admin' }
const orgB = { id: 'b', name: 'B', role: 'organization_user' }
const user = {
  id: 'user',
  organizations: [orgA, orgB],
  default_organization_id: 'b',
}

test('organization selection uses valid choice, then default, then first membership', () => {
  assert.equal(resolveOrganization(user, 'a'), orgA)
  assert.equal(resolveOrganization(user, 'removed'), orgB)
  assert.equal(
    resolveOrganization({ ...user, default_organization_id: 'removed' }, null),
    orgA,
  )
  assert.equal(resolveOrganization({ ...user, organizations: [] }, 'a'), null)
})

test('cache keys distinguish identical resources in different organizations', () => {
  assert.notDeepEqual(
    organizationQueryKey('a', 'entities'),
    organizationQueryKey('b', 'entities'),
  )
})

test('organization storage belongs to one user and clears at logout', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const entries = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key),
    },
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous)
    else delete globalThis.sessionStorage
  })
  saveOrganizationSelection('alice', 'a')
  assert.equal(readOrganizationSelection('alice'), 'a')
  assert.equal(readOrganizationSelection('bob'), null)
  clearOrganizationSelection()
  assert.equal(readOrganizationSelection('alice'), null)
  entries.set('miniapp.active-organization', 'invalid-json')
  assert.equal(readOrganizationSelection('alice'), null)
})

test('an aborted request does not turn into a network error or clear the session', async (t) => {
  const { client } = setup(t)
  const controller = new AbortController()
  controller.abort()
  const aborted = new DOMException('Aborted', 'AbortError')
  fetch.mock.mockImplementation(async () => {
    throw aborted
  })
  client.setUnauthorizedHandler(() =>
    assert.fail('aborted requests must not log out'),
  )
  await assert.rejects(
    client.request('/auth/me', { signal: controller.signal }),
    (error) => error === aborted,
  )
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { QueryClient } from '@tanstack/react-query'

// Transpile the real application modules without Vite; only replace the Vite
// environment wrapper with the same client configured for the test endpoint.
async function moduleUrl(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  for (const [specifier, url] of Object.entries(imports)) {
    outputText = outputText.replaceAll(`'${specifier}'`, JSON.stringify(url))
  }
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
}

const clientUrl = await moduleUrl('../src/lib/api/client.ts')
const selectionUrl = await moduleUrl(
  '../src/features/organizations/selection.ts',
)
const apiSource = `import { createApiClient } from ${JSON.stringify(clientUrl)}; export const api = createApiClient({ baseUrl: '/api', readCookie: () => '' });`
const apiUrl = `data:text/javascript;base64,${Buffer.from(apiSource).toString('base64')}`
const sessionUrl = await moduleUrl('../src/features/auth/session.ts', {
  '@tanstack/react-query': import.meta.resolve('@tanstack/react-query'),
  '@/lib/api': apiUrl,
  '@/lib/api/client': clientUrl,
  '@/features/organizations/selection': selectionUrl,
})
const guardsUrl = await moduleUrl('../src/features/auth/guards.ts', {
  '@tanstack/react-router': import.meta.resolve('@tanstack/react-router'),
  './session': sessionUrl,
  '@/lib/api': apiUrl,
  '@/features/organizations/selection': selectionUrl,
})
const {
  requireAuthentication,
  requireGuest,
  requirePlatformAdmin,
  requireOrganizationAdmin,
  requireOrganizationMember,
} = await import(guardsUrl)
const { clearSession, sessionKey, refreshSession } = await import(sessionUrl)

const user = {
  id: 'user',
  email: 'user@example.com',
  is_superuser: false,
  is_verified: true,
  default_organization_id: 'org',
  organizations: [
    {
      id: 'org',
      name: 'Organisation',
      slug: 'org',
      role: 'organization_admin',
    },
  ],
}

function setup(t, status, body) {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(body, { status }),
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  t.after(() => client.clear())
  return client
}

function redirectsTo(path) {
  return (error) =>
    error?.options?.to === path && error.options.replace === true
}

test('anonymous session redirects protected routes to login', async (t) => {
  const client = setup(t, 401, { detail: 'Authentication required' })
  await assert.rejects(requireAuthentication(client), redirectsTo('/login'))
})

test('anonymous session can access guest routes', async (t) => {
  const client = setup(t, 401, { detail: 'Authentication required' })
  await requireGuest(client)
})

test('authenticated session redirects guest routes to home', async (t) => {
  const client = setup(t, 200, user)
  await assert.rejects(requireGuest(client), redirectsTo('/home'))
})

test('protected guard returns the server user and caches the session', async (t) => {
  const client = setup(t, 200, user)
  const result = await requireAuthentication(client)
  assert.deepEqual(result.user, user)
  assert.deepEqual(client.getQueryData(sessionKey), user)
})

test('PlatformAdmin without memberships can enter the protected shell', async (t) => {
  const admin = {
    ...user,
    is_superuser: true,
    organizations: [],
    default_organization_id: null,
  }
  const client = setup(t, 200, admin)
  assert.deepEqual((await requireAuthentication(client)).user, admin)
})

test('server failure stays an error, not an anonymous redirect', async (t) => {
  const client = setup(t, 503, { detail: 'Unavailable' })
  await assert.rejects(
    requireAuthentication(client),
    (error) => error.status === 503,
  )
  await assert.rejects(requireGuest(client), (error) => error.status === 503)
})

test('clearing a session removes business data before setting anonymous state', async (t) => {
  const client = setup(t, 200, user)
  client.setQueryData(sessionKey, user)
  client.setQueryData(['organizations', 'org', 'entities'], ['private data'])
  await clearSession(client)
  assert.equal(client.getQueryData(sessionKey), null)
  assert.equal(
    client.getQueryData(['organizations', 'org', 'entities']),
    undefined,
  )
})

test('navigation reuses cached user even when the query is marked stale', async (t) => {
  const client = setup(t, 200, user)
  await requireAuthentication(client)
  await client.invalidateQueries({ queryKey: sessionKey, refetchType: 'none' })
  await requireAuthentication(client)
  await requirePlatformAdmin(client).catch(() => undefined)
  await assert.rejects(requireGuest(client), redirectsTo('/home'))
  assert.equal(fetch.mock.callCount(), 1)
})

test('cached anonymous state does not refetch on every guest navigation', async (t) => {
  const client = setup(t, 401, { detail: 'Authentication required' })
  await requireGuest(client)
  await requireGuest(client)
  await assert.rejects(requireAuthentication(client), redirectsTo('/login'))
  assert.equal(fetch.mock.callCount(), 1)
})

test('login refresh bypasses the cached anonymous state', async (t) => {
  const client = setup(t, 200, user)
  client.setQueryData(sessionKey, null)
  assert.deepEqual(await refreshSession(client), user)
  assert.equal(fetch.mock.callCount(), 1)
})

test('ordinary users are redirected away from platform administration', async (t) => {
  const client = setup(t, 200, user)
  await assert.rejects(requirePlatformAdmin(client), redirectsTo('/home'))
})

test('SuperUsers may open platform administration', async (t) => {
  const admin = { ...user, is_superuser: true }
  const client = setup(t, 200, admin)
  assert.deepEqual((await requirePlatformAdmin(client)).user, admin)
})

test('organization admin can open the scoped administration page', async (t) => {
  const client = setup(t, 200, user)
  const result = await requireOrganizationAdmin(client)
  assert.equal(result.organization.id, 'org')
})

test('organization users, missing membership and SuperUsers cannot open organization admin routes', async (t) => {
  const client = setup(t, 200, user)
  for (const account of [
    {
      ...user,
      organizations: [{ ...user.organizations[0], role: 'organization_user' }],
    },
    { ...user, organizations: [] },
    { ...user, is_superuser: true },
  ]) {
    client.setQueryData(sessionKey, account)
    await assert.rejects(requireOrganizationAdmin(client), redirectsTo('/home'))
  }
})

test('changing to an organization with user role revokes organization administration', async (t) => {
  let selected = 'org'
  const previousStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'sessionStorage',
  )
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: () =>
        JSON.stringify({ userId: user.id, organizationId: selected }),
    },
  })
  t.after(() => {
    if (previousStorage)
      Object.defineProperty(globalThis, 'sessionStorage', previousStorage)
    else delete globalThis.sessionStorage
  })
  const client = setup(t, 200, {
    ...user,
    organizations: [
      ...user.organizations,
      { id: 'other', name: 'Other', slug: 'other', role: 'organization_user' },
    ],
  })
  await requireOrganizationAdmin(client)
  selected = 'other'
  await assert.rejects(requireOrganizationAdmin(client), redirectsTo('/home'))
  assert.equal(fetch.mock.callCount(), 1)
})

test('ordinary organization members can access entity tables without admin rights', async (t) => {
  const account = {
    ...user,
    organizations: [{ ...user.organizations[0], role: 'organization_user' }],
  }
  const client = setup(t, 200, account)
  assert.equal((await requireOrganizationMember(client)).organization.id, 'org')
  await assert.rejects(requireOrganizationAdmin(client), redirectsTo('/home'))
  assert.equal(fetch.mock.callCount(), 1)
})

test('accounts without organization cannot access entity tables', async (t) => {
  const client = setup(t, 200, { ...user, organizations: [] })
  await assert.rejects(requireOrganizationMember(client), redirectsTo('/home'))
})

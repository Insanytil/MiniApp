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
const selectionUrl = await moduleUrl(
  '../src/features/organizations/selection.ts',
)
const paginationUrl = await moduleUrl(
  '../src/components/data-table/server-pagination.ts',
)
const apiSource = `import { createApiClient } from ${JSON.stringify(clientUrl)}; export const api = createApiClient({ baseUrl: '/api', readCookie: () => 'miniapp_csrf=csrf-test' });`
const apiUrl = `data:text/javascript;base64,${Buffer.from(apiSource).toString('base64')}`
const { api } = await import(apiUrl)
const { ApiError } = await import(clientUrl)
const usersUrl = await moduleUrl(
  '../src/features/organization-administration/users.ts',
  {
    '@tanstack/react-query': import.meta.resolve('@tanstack/react-query'),
    zod: import.meta.resolve('zod'),
    '@/lib/api': apiUrl,
    '@/lib/api/client': clientUrl,
    '@/features/organizations/selection': selectionUrl,
    '@/components/data-table/server-pagination': paginationUrl,
  },
)
const {
  organizationUsersQuery,
  createOrganizationUser,
  setOrganizationUserAccess,
  requestOrganizationPasswordReset,
  organizationUserSchema,
  organizationUserError,
} = await import(usersUrl)

test('organization users are searched and cached per explicit organization, not the ambient selection', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ items: [], pagination: { total: 0 } }),
  )
  api.setOrganization('other')
  const params = { page: 2, pageSize: 50, search: 'a+b@example.com' }
  const query = organizationUsersQuery('authorized-org', params)
  const signal = new AbortController().signal
  await query.queryFn({ signal })
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(
    url,
    '/api/organization/users?page=2&page_size=50&search=a%2Bb%40example.com',
  )
  assert.equal(
    new Headers(request.headers).get('X-Organization-ID'),
    'authorized-org',
  )
  assert.equal(request.signal, signal)
  assert.notDeepEqual(
    query.queryKey,
    organizationUsersQuery('other', params).queryKey,
  )
})
for (const role of ['organization_admin', 'organization_user']) {
  test(`account creation accepts ${role}, scopes organization via header and omits privileged fields`, async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () =>
      Response.json({ invitation_queued: true }),
    )
    await createOrganizationUser('org', {
      email: '  USER@EXAMPLE.COM  ',
      role,
      organization_id: 'other',
      is_superuser: true,
    })
    const [url, request] = fetch.mock.calls[0].arguments
    assert.equal(url, '/api/organization/users')
    assert.equal(request.method, 'POST')
    assert.deepEqual(JSON.parse(request.body), {
      email: 'user@example.com',
      role,
    })
    assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org')
    assert.equal(new Headers(request.headers).get('X-CSRF-Token'), 'csrf-test')
  })
}
test('creation rejects platform roles and malformed emails before making a request', () => {
  assert.equal(
    organizationUserSchema.safeParse({
      email: 'valid@example.com',
      role: 'PlatformAdmin',
    }).success,
    false,
  )
  assert.equal(
    organizationUserSchema.safeParse({
      email: 'invalid',
      role: 'organization_user',
    }).success,
    false,
  )
})
test('suspension targets only membership access and sends an explicit state', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 204 }),
  )
  await setOrganizationUserAccess('org-a', 'user/one', false)
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/organization/users/user%2Fone/access')
  assert.equal(request.method, 'PATCH')
  assert.deepEqual(JSON.parse(request.body), { is_active: false })
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org-a')
  assert.equal(new Headers(request.headers).get('X-CSRF-Token'), 'csrf-test')
})
test('password reset queues in the captured organization and preserves queue failure', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ queued: false }),
  )
  api.setOrganization('new-selection')
  assert.deepEqual(
    await requestOrganizationPasswordReset('original-org', 'user'),
    { queued: false },
  )
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/organization/users/user/password-reset-email')
  assert.equal(
    new Headers(request.headers).get('X-Organization-ID'),
    'original-org',
  )
  assert.equal(request.method, 'POST')
})
test('authorization and cross-organization target errors propagate without retrying', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ detail: 'Forbidden' }, { status: 403 }),
  )
  await assert.rejects(
    requestOrganizationPasswordReset('org', 'outside-member'),
    (error) => error.status === 403,
  )
  assert.equal(fetch.mock.callCount(), 1)
  assert.match(
    organizationUserError(new ApiError(409, 'duplicate'), 'create'),
    /déjà/,
  )
})

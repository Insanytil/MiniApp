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
const paginationUrl = await moduleUrl(
  '../src/components/data-table/server-pagination.ts',
)
const { listSearchParams, lastAvailablePage } = await import(paginationUrl)
const { ApiError } = await import(clientUrl)
const apiSource = `import { createApiClient } from ${JSON.stringify(clientUrl)}; export const api = createApiClient({ baseUrl: '/api', readCookie: () => '' });`
const apiUrl = `data:text/javascript;base64,${Buffer.from(apiSource).toString('base64')}`
const sessionStub = `data:text/javascript,export const sessionKey = ['auth', 'me'];`
const usersUrl = await moduleUrl(
  '../src/features/platform-administration/users.ts',
  {
    '@tanstack/react-query': import.meta.resolve('@tanstack/react-query'),
    zod: import.meta.resolve('zod'),
    '@/lib/api': apiUrl,
    '@/lib/api/client': clientUrl,
    '@/components/data-table/server-pagination': paginationUrl,
  },
)
const organizationsUrl = await moduleUrl(
  '../src/features/platform-administration/organizations.ts',
  {
    '@tanstack/react-query': import.meta.resolve('@tanstack/react-query'),
    zod: import.meta.resolve('zod'),
    '@/lib/api': apiUrl,
    '@/lib/api/client': clientUrl,
    '@/features/auth/session': sessionStub,
    './users': usersUrl,
    '@/components/data-table/server-pagination': paginationUrl,
  },
)
const {
  organizationSchema,
  toSlug,
  organizationError,
  organizationsQuery,
  searchOrganizationOptions,
} = await import(organizationsUrl)

test('server list uses backend page/page_size parameters and encodes searches', () => {
  const query = new URLSearchParams(
    listSearchParams({ page: 3, pageSize: 50, search: '  A&B + 100%  ' }),
  )
  assert.equal(query.get('page'), '3')
  assert.equal(query.get('page_size'), '50')
  assert.equal(query.get('search'), 'A&B + 100%')
  assert.equal(
    new URLSearchParams(
      listSearchParams({ page: 1, pageSize: 20, search: '  ' }),
    ).has('search'),
    false,
  )
})

test('empty results still have one UI page and deletion clamps the last page', () => {
  assert.equal(lastAvailablePage(0), 1)
  assert.equal(lastAvailablePage(4), 4)
})

test('organization validation matches backend limits and slug rules', () => {
  assert.equal(
    organizationSchema.safeParse({ name: '  ', slug: 'valid' }).success,
    false,
  )
  for (const slug of [
    'UPPER',
    '-invalid',
    'two--hyphens',
    'invalid-',
    'white space',
    'a'.repeat(101),
  ]) {
    assert.equal(
      organizationSchema.safeParse({ name: 'Test', slug }).success,
      false,
    )
  }
  assert.deepEqual(
    organizationSchema.parse({ name: '  Équipe  ', slug: 'equipe-2' }),
    { name: 'Équipe', slug: 'equipe-2' },
  )
  assert.equal(
    organizationSchema.safeParse({ name: 'a'.repeat(256), slug: 'test' })
      .success,
    false,
  )
})

test('generated slug handles accents, punctuation and length boundaries', () => {
  assert.equal(toSlug('  Équipe R&D — Bruxelles ! '), 'equipe-r-d-bruxelles')
  const slug = toSlug(`${'a'.repeat(99)} autre équipe`)
  assert.ok(slug.length <= 100)
  assert.equal(slug.endsWith('-'), false)
})

test('organization query fetches the requested server page with an abort signal', async (t) => {
  const response = {
    items: [],
    pagination: { page: 2, page_size: 10, total: 12, total_pages: 2 },
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json(response))
  const signal = new AbortController().signal
  const options = organizationsQuery({
    page: 2,
    pageSize: 10,
    search: 'studio',
  })
  assert.deepEqual(await options.queryFn({ signal }), response)
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(
    url,
    '/api/platform/organizations?page=2&page_size=10&search=studio',
  )
  assert.equal(request.signal, signal)
  assert.equal(request.headers.has('X-Organization-ID'), false)
})

test('different pages/searches have distinct cache keys', () => {
  const first = organizationsQuery({
    page: 1,
    pageSize: 20,
    search: '',
  }).queryKey
  assert.notDeepEqual(
    first,
    organizationsQuery({ page: 2, pageSize: 20, search: '' }).queryKey,
  )
  assert.notDeepEqual(
    first,
    organizationsQuery({ page: 1, pageSize: 20, search: 'test' }).queryKey,
  )
})

test('business conflicts are explained without pretending deletion succeeded', () => {
  assert.match(
    organizationError(
      new ApiError(409, 'Organization cannot be deleted while it has members'),
      'delete',
    ),
    /membres/,
  )
  assert.match(
    organizationError(
      new ApiError(409, 'Organization slug already exists'),
      'save',
    ),
    /identifiant/,
  )
  assert.match(
    organizationError(
      new ApiError(409, 'Organization name already exists'),
      'save',
    ),
    /nom/,
  )
})

test('autocomplete requests only active organizations and preserves stable IDs', async (t) => {
  const signal = new AbortController().signal
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      items: [
        { id: 'org-1', name: 'Équipe Bruxelles', slug: 'equipe-bruxelles' },
      ],
      pagination: { page: 1, page_size: 20, total: 25, total_pages: 2 },
    }),
  )
  const result = await searchOrganizationOptions(' équipe ', signal)
  const [url, init] = fetch.mock.calls[0].arguments
  const query = new URL(url, 'http://localhost').searchParams
  assert.equal(query.get('search'), 'équipe')
  assert.equal(query.get('page'), '1')
  assert.equal(query.get('page_size'), '20')
  assert.equal(query.get('is_active__eq'), 'true')
  assert.equal(init.signal, signal)
  assert.deepEqual(result, {
    items: [
      {
        value: 'org-1',
        label: 'Équipe Bruxelles',
        description: 'equipe-bruxelles',
      },
    ],
    hasMore: true,
  })
})

test('autocomplete handles an empty result window without inventing a selection', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      items: [],
      pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
    }),
  )
  assert.deepEqual(
    await searchOrganizationOptions('absent', new AbortController().signal),
    { items: [], hasMore: false },
  )
})

test('user autocomplete marks existing affiliations as unavailable, including disabled ones', async (t) => {
  const { searchUsersForOrganization } = await import(usersUrl)
  const signal = new AbortController().signal
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      items: [
        {
          id: 'new',
          email: 'new@example.com',
          is_active: true,
          is_verified: true,
          memberships: [],
        },
        {
          id: 'member',
          email: 'member@example.com',
          is_active: true,
          is_verified: true,
          memberships: [{ organization_id: 'org-2', is_active: true }],
        },
        {
          id: 'suspended',
          email: 'suspended@example.com',
          is_active: true,
          is_verified: true,
          memberships: [{ organization_id: 'org-2', is_active: false }],
        },
      ],
      pagination: { page: 1, page_size: 20, total: 3, total_pages: 1 },
    }),
  )
  const result = await searchUsersForOrganization('org-2', 'example', signal)
  assert.deepEqual(
    result.items.map((option) => option.disabled),
    [false, true, true],
  )
  assert.match(result.items[2].description, /accès désactivé/)
  const [url, init] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/platform/users?page=1&page_size=20&search=example')
  assert.equal(init.signal, signal)
  assert.equal(result.hasMore, false)
})

test('linking an existing user can select a suspended organization without reactivating it', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      items: [
        {
          id: 'suspended-org',
          name: 'Organisation suspendue',
          slug: 'suspended-org',
          is_active: false,
        },
      ],
      pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
    }),
  )
  const result = await searchOrganizationOptions(
    '',
    new AbortController().signal,
    false,
  )
  const [url] = fetch.mock.calls[0].arguments
  assert.equal(
    new URL(url, 'http://localhost').searchParams.has('is_active__eq'),
    false,
  )
  assert.match(result.items[0].description, /suspendue/)
  assert.equal(result.items[0].value, 'suspended-org')
})

const membersUrl = await moduleUrl(
  '../src/features/platform-administration/organization-members.ts',
  {
    '@tanstack/react-query': import.meta.resolve('@tanstack/react-query'),
    '@/lib/api': apiUrl,
    '@/components/data-table/server-pagination': paginationUrl,
    './organizations': organizationsUrl,
  },
)
const { organizationMembersQuery } = await import(membersUrl)

test('organization members use scoped pagination, encoded search and cancellation', async (t) => {
  const response = {
    items: [
      { user_id: 'u1', email: 'a@example.com', membership_is_active: false },
    ],
    pagination: { page: 2, page_size: 20, total: 21, total_pages: 2 },
  }
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  const params = { page: 2, pageSize: 20, search: 'a+b@example.com' }
  const options = organizationMembersQuery('org/one', params)
  const signal = new AbortController().signal
  const result = await options.queryFn({ signal })
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(
    url,
    '/api/platform/organizations/org%2Fone/members?page=2&page_size=20&search=a%2Bb%40example.com',
  )
  assert.equal(request.signal, signal)
  assert.equal(result.items[0].membership_is_active, false)
  assert.notDeepEqual(
    options.queryKey,
    organizationMembersQuery('org-two', params).queryKey,
  )
  assert.deepEqual(options.queryKey.slice(0, 2), ['platform', 'organizations'])
})

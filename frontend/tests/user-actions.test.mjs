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
const apiSource = `import { createApiClient } from ${JSON.stringify(clientUrl)}; export const api = createApiClient({ baseUrl: '/api', readCookie: () => 'miniapp_csrf=csrf-test' });`
const apiUrl = `data:text/javascript;base64,${Buffer.from(apiSource).toString('base64')}`
const emailUrl = await moduleUrl(
  '../src/features/platform-administration/user-email.ts',
  {
    '@/lib/api': apiUrl,
    '@/lib/api/client': clientUrl,
  },
)
const { userEmailActionFor, sendUserEmail, userEmailError } = await import(
  emailUrl
)
const { ApiError } = await import(clientUrl)
const { membershipAccessState, filterUserMemberships } = await import(
  await moduleUrl('../src/features/platform-administration/user-access.ts')
)

const activeUser = { is_active: true, is_verified: true }
const activeMembership = {
  organization_id: 'org',
  organization_is_active: true,
  is_active: true,
}

test('email action follows account verification status', () => {
  assert.equal(userEmailActionFor({ is_verified: false }), 'verification')
  assert.equal(userEmailActionFor({ is_verified: true }), 'password-reset')
})

for (const [action, endpoint] of [
  ['verification', 'verification-email'],
  ['password-reset', 'password-reset-email'],
]) {
  test(`${action} queues an email using the admin endpoint and CSRF`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
      Response.json({ queued: true }),
    )
    assert.deepEqual(await sendUserEmail('user-1', action), { queued: true })
    const [url, init] = fetch.mock.calls[0].arguments
    assert.equal(url, `/api/platform/users/user-1/${endpoint}`)
    assert.equal(init.method, 'POST')
    assert.equal(init.headers.get('X-CSRF-Token'), 'csrf-test')
    assert.equal(init.credentials, 'include')
    assert.equal(init.body, undefined)
    assert.equal(init.headers.has('X-Organization-ID'), false)
  })
}

test('a rejected queue submission is not reported as a successful email', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ queued: false }),
  )
  assert.equal((await sendUserEmail('user-1', 'verification')).queued, false)
  assert.equal(fetch.mock.callCount(), 1)
})

test('email conflicts distinguish already verified and not yet verified accounts', () => {
  assert.match(
    userEmailError(new ApiError(409, 'Conflict'), 'verification'),
    /déjà activé/,
  )
  assert.match(
    userEmailError(new ApiError(409, 'Conflict'), 'password-reset'),
    /d’abord être activé/,
  )
  assert.match(
    userEmailError(new ApiError(404, 'Not found'), 'verification'),
    /n’existe plus/,
  )
})

test('server failures propagate without implicitly retrying email requests', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({}, { status: 503 }),
  )
  await assert.rejects(
    sendUserEmail('user-1', 'verification'),
    (error) => error.status === 503,
  )
  assert.equal(fetch.mock.callCount(), 1)
})

test('active access requires an active account, organization, membership and verification', () => {
  assert.equal(membershipAccessState(activeUser, activeMembership).active, true)
  assert.equal(
    membershipAccessState(activeUser, { ...activeMembership, is_active: false })
      .label,
    'Accès désactivé',
  )
  assert.equal(
    membershipAccessState(activeUser, {
      ...activeMembership,
      organization_is_active: false,
    }).label,
    'Organisation suspendue',
  )
  assert.equal(
    membershipAccessState({ ...activeUser, is_active: false }, activeMembership)
      .label,
    'Compte suspendu',
  )
  assert.equal(
    membershipAccessState(
      { ...activeUser, is_verified: false },
      activeMembership,
    ).label,
    'Activation en attente',
  )
})

test('each organization retains its independent access state', () => {
  const memberships = [
    activeMembership,
    { ...activeMembership, organization_id: 'other', is_active: false },
  ]
  assert.deepEqual(
    memberships.map(
      (membership) => membershipAccessState(activeUser, membership).active,
    ),
    [true, false],
  )
  assert.equal(memberships[0].is_active, true)
})

test('a suspended organization never appears accessible despite an active membership', () => {
  const state = membershipAccessState(activeUser, {
    ...activeMembership,
    organization_is_active: false,
  })
  assert.equal(state.active, false)
  assert.match(state.reason, /adhésion est active.*organisation est suspendue/)
})

const membershipsUrl = await moduleUrl(
  '../src/features/platform-administration/user-memberships.ts',
  { '@/lib/api': apiUrl },
)
const { setUserOrganizationAccess, addOrganizationMember } = await import(
  membershipsUrl
)

test('suspending membership targets only the selected organization and never the whole account', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 204 }),
  )
  await setUserOrganizationAccess('user-1', 'org-2', false)
  const [url, init] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/platform/users/user-1/organizations/org-2')
  assert.equal(init.method, 'PATCH')
  assert.deepEqual(JSON.parse(init.body), { is_active: false })
  assert.equal(init.headers.get('X-CSRF-Token'), 'csrf-test')
  assert.equal(init.headers.has('X-Organization-ID'), false)
})

test('reactivating membership sends an explicit active state', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 204 }),
  )
  await setUserOrganizationAccess('user-1', 'org-2', true)
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), {
    is_active: true,
  })
})

test('a failed membership update propagates without pretending that access changed', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({}, { status: 403 }),
  )
  await assert.rejects(
    setUserOrganizationAccess('user-1', 'org-2', false),
    (error) => error.status === 403,
  )
  assert.equal(fetch.mock.callCount(), 1)
})

test('organization overlay filtering handles accents and preserves inactive memberships', () => {
  const memberships = [
    {
      ...activeMembership,
      organization_name: 'Équipe Bruxelles',
      organization_slug: 'equipe-bruxelles',
    },
    {
      ...activeMembership,
      organization_id: 'other',
      organization_name: 'Paris',
      organization_slug: 'paris',
      is_active: false,
    },
  ]
  assert.deepEqual(
    filterUserMemberships(memberships, ' EQUIPE ').map(
      (item) => item.organization_id,
    ),
    ['org'],
  )
  assert.deepEqual(
    filterUserMemberships(memberships, 'paris').map(
      (item) => item.organization_id,
    ),
    ['other'],
  )
  assert.equal(filterUserMemberships(memberships, ''), memberships)
  assert.deepEqual(filterUserMemberships(memberships, 'absent'), [])
})

for (const role of ['organization_user', 'organization_admin']) {
  test(`linking an existing account creates only a membership with role ${role}`, async (t) => {
    t.mock.method(
      globalThis,
      'fetch',
      async () => new Response(null, { status: 204 }),
    )
    await addOrganizationMember('org-2', 'user-1', role)
    const [url, init] = fetch.mock.calls[0].arguments
    assert.equal(url, '/api/platform/organizations/org-2/members')
    assert.equal(init.method, 'POST')
    assert.deepEqual(JSON.parse(init.body), { user_id: 'user-1', role })
    assert.equal(init.headers.get('X-CSRF-Token'), 'csrf-test')
    assert.equal(init.headers.has('X-Organization-ID'), false)
    assert.equal(fetch.mock.callCount(), 1)
  })
}

test('duplicate membership does not silently reactivate a suspended access', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { detail: 'User already belongs to this organization' },
      { status: 409 },
    ),
  )
  await assert.rejects(
    addOrganizationMember('org-2', 'user-1', 'organization_user'),
    (error) => error.status === 409,
  )
  assert.equal(fetch.mock.callCount(), 1)
  assert.equal(fetch.mock.calls[0].arguments[1].method, 'POST')
})

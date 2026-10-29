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
const definitionsUrl = await moduleUrl(
  '../src/features/entity-types/entity-types.ts',
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
  entityTypesQuery,
  entityTypeSchema,
  toTechnicalName,
  saveEntityType,
  deleteEntityType,
  entityTypeError,
} = await import(definitionsUrl)

test('technical name suggestion normalizes accents and separators and stays valid after truncation', () => {
  assert.equal(toTechnicalName('Tâche de projet'), 'tache_de_projet')
  assert.equal(toTechnicalName('123 Clients'), 'entity_123_clients')
  assert.equal(toTechnicalName(' Client !! '), 'client')
  const identifier = toTechnicalName('a'.repeat(99) + ' b')
  assert.equal(identifier, 'a'.repeat(99))
  assert.equal(
    entityTypeSchema.safeParse({
      name: 'Name',
      technical_name: identifier,
      description: '',
    }).success,
    true,
  )
})
test('validation rejects empty names and invalid identifiers', () => {
  for (const technical_name of [
    '',
    'Client',
    '1client',
    'client-task',
    'client_',
    'client__task',
    'équipe',
  ])
    assert.equal(
      entityTypeSchema.safeParse({
        name: 'Client',
        technical_name,
        description: '',
      }).success,
      false,
    )
  assert.equal(
    entityTypeSchema.safeParse({
      name: '  ',
      technical_name: 'client',
      description: '',
    }).success,
    false,
  )
})
test('listing searches both names server-side, scopes header and cache, and forwards cancellation', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ items: [], pagination: { total: 0 } }),
  )
  api.setOrganization('new-selection')
  const params = { page: 2, pageSize: 50, search: 'client + projet' }
  const query = entityTypesQuery('org-a', params)
  const signal = new AbortController().signal
  await query.queryFn({ signal })
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(
    url,
    '/api/organization/entity-types?page=2&page_size=50&search=client+%2B+projet',
  )
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org-a')
  assert.equal(request.signal, signal)
  assert.notDeepEqual(
    query.queryKey,
    entityTypesQuery('org-b', params).queryKey,
  )
})
test('creation submits only definition metadata and normalizes optional description', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ id: 'type' }),
  )
  await saveEntityType('org-a', {
    name: ' Client ',
    technical_name: 'client',
    description: ' ',
    organization_id: 'org-b',
    system_fields: [],
    created_by: 'other-user',
  })
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/organization/entity-types')
  assert.equal(request.method, 'POST')
  assert.deepEqual(JSON.parse(request.body), {
    name: 'Client',
    technical_name: 'client',
    description: null,
  })
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org-a')
  assert.equal(new Headers(request.headers).get('X-CSRF-Token'), 'csrf-test')
})
test('editing excludes immutable identifier and system metadata', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ id: 'type' }),
  )
  await saveEntityType(
    'org-a',
    {
      name: 'Clients',
      technical_name: 'different',
      description: ' New description ',
      updated_by: 'spoofed',
    },
    'type/one',
  )
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/organization/entity-types/type%2Fone')
  assert.equal(request.method, 'PATCH')
  assert.deepEqual(JSON.parse(request.body), {
    name: 'Clients',
    description: 'New description',
  })
})
test('deletion remains scoped even after changing the active organization', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 204 }),
  )
  api.setOrganization('other')
  await deleteEntityType('original', 'type/one')
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/organization/entity-types/type%2Fone')
  assert.equal(request.method, 'DELETE')
  assert.equal(
    new Headers(request.headers).get('X-Organization-ID'),
    'original',
  )
})
test('duplicate and access failures are explicit and do not retry mutations', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ detail: 'Conflict' }, { status: 409 }),
  )
  await assert.rejects(
    saveEntityType('org', {
      name: 'Client',
      technical_name: 'client',
      description: '',
    }),
    (error) => error.status === 409,
  )
  assert.equal(fetch.mock.callCount(), 1)
  assert.match(entityTypeError(new ApiError(409, 'Conflict')), /déjà utilisé/)
  assert.match(
    entityTypeError(new ApiError(403, 'Forbidden')),
    /administrateur/,
  )
})

const configUrl = await moduleUrl(
  '../src/features/entity-types/configuration.ts',
  {
    '@tanstack/react-query': import.meta.resolve('@tanstack/react-query'),
    zod: import.meta.resolve('zod'),
    '@/lib/api': apiUrl,
    '@/lib/api/client': clientUrl,
    './entity-types': definitionsUrl,
  },
)
const {
  configurationCatalogQuery,
  saveConfiguration,
  withDisplayProfile,
  navigations,
  dependentDefinitions,
  relationCount,
  configurationError,
} = await import(configUrl)
const { presentRecord, safeImageUrl, recordInitials } = await import(
  await moduleUrl('../src/features/entity-types/presentation.ts')
)
const { relationRows } = await import(
  await moduleUrl('../src/features/entity-types/relations.ts')
)
const { moveViewColumn, viewColumnKey } = await import(
  await moduleUrl('../src/features/entity-types/view-column-order.ts')
)

test('view column reordering preserves identities, relation settings and the original array', () => {
  const first = {
    id: 'first',
    label: 'Client',
    relation_id: 'relation',
    profile_id: 'compact',
    direction: 'incoming',
    collection_display: 'first',
  }
  const second = { id: 'second', label: 'Total', field_id: 'amount' }
  const third = {
    id: 'third',
    label: 'Client',
    relation_id: 'relation',
    profile_id: 'detailed',
  }
  const columns = Object.freeze([first, second, third])
  const moved = moveViewColumn(columns, 'first', 'third')
  assert.deepEqual(
    moved.map((column) => column.id),
    ['second', 'third', 'first'],
  )
  assert.equal(moved[2], first)
  assert.equal(moved[2].profile_id, 'compact')
  assert.equal(moved[2].direction, 'incoming')
  assert.deepEqual(
    columns.map((column) => column.id),
    ['first', 'second', 'third'],
  )
  assert.deepEqual(moveViewColumn(moved, 'first', 'second'), columns)
})

test('stale or unchanged column drag targets do not alter the draft', () => {
  const columns = [{ id: 'one' }, { id: 'two' }]
  assert.equal(moveViewColumn(columns, 'missing', 'two'), columns)
  assert.equal(moveViewColumn(columns, 'one', 'missing'), columns)
  assert.equal(moveViewColumn(columns, 'one', 'one'), columns)
})

test('a view allows each field, relation navigation and representation only once', async () => {
  const { definitionError } = await import(configUrl)
  const field = {id:'one',label:'Prénom',kind:'field',field_id:'first',relation_id:null,profile_id:null,direction:'outgoing',collection_display:'list'}
  const duplicate = {...field,id:'two',label:'Autre libellé'}
  assert.match(definitionError('views',{id:'view',name:'Vue',is_default:true,columns:[field,duplicate]}),/une seule fois/)
  const relation={...field,kind:'relation',field_id:null,relation_id:'r',direction:'incoming'}
  const counter={...relation,id:'counter',kind:'count'}
  assert.equal(viewColumnKey(relation),viewColumnKey(counter))
  assert.notEqual(viewColumnKey(relation),viewColumnKey({...relation,direction:'outgoing'}))
  assert.match(definitionError('views',{id:'view',name:'Vue',is_default:true,columns:[relation,counter]}),/une seule fois/)
})
const emptyConfig = () => ({
  schema_version: 1,
  fields: [],
  relations: [],
  display_profiles: [],
  views: [],
})

test('relation rows reverse cardinality and expose the defining type on inverse navigation', () => {
  for (const [source_max, target_max, direct, inverse] of [
    [1, null, 'Plusieurs vers un', 'Un vers plusieurs'],
    [null, 1, 'Un vers plusieurs', 'Plusieurs vers un'],
    [1, 1, 'Un vers un', 'Un vers un'],
    [null, null, 'Plusieurs vers plusieurs', 'Plusieurs vers plusieurs'],
  ]) {
    const definition = {
      id: 'r',
      name: 'Client',
      technical_name: 'client',
      inverse_name: 'Factures',
      target_type_ids: ['client'],
      source_max,
      target_max,
      required: true,
      on_delete: 'restrict',
    }
    const catalog = [
      {
        id: 'invoice',
        name: 'Facture',
        configuration: { ...emptyConfig(), relations: [definition] },
      },
      { id: 'client', name: 'Client', configuration: emptyConfig() },
    ]
    const outgoing = relationRows('invoice', catalog)[0]
    const incoming = relationRows('client', catalog)[0]
    assert.equal(outgoing.cardinality, direct)
    assert.equal(incoming.cardinality, inverse)
    assert.equal(incoming.name, 'Factures')
    assert.equal(incoming.ownerId, 'invoice')
    assert.deepEqual(incoming.linkedTypes, ['Facture'])
    assert.equal(incoming.definition, definition)
  }
})

test('self relations display both directions and polymorphic destinations remain grouped', () => {
  const definition = {
    id: 'r',
    name: 'Responsable',
    technical_name: 'responsable',
    inverse_name: 'Éléments gérés',
    target_type_ids: ['person', 'company'],
    source_max: 1,
    target_max: null,
    required: false,
    on_delete: 'restrict',
  }
  const catalog = [
    {
      id: 'person',
      name: 'Personne',
      configuration: { ...emptyConfig(), relations: [definition] },
    },
    { id: 'company', name: 'Entreprise', configuration: emptyConfig() },
  ]
  const rows = relationRows('person', catalog)
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map((row) => row.direction),
    ['outgoing', 'incoming'],
  )
  assert.deepEqual(rows[0].linkedTypes, ['Personne', 'Entreprise'])
  assert.deepEqual(rows[1].linkedTypes, ['Personne'])
  assert.equal(rows[0].id, rows[1].id)
  assert.equal(relationRows('company', catalog).length, 1)
})

test('display profile composes names in order, excludes missing values and supports false and zero', () => {
  const profile = {
    title_fields: ['first', 'last'],
    secondary_fields: ['zero', 'missing', 'false'],
    separator: ' ',
    image_field: 'photo',
  }
  const result = presentRecord(
    profile,
    {
      first: 'Lucien',
      last: 'Vervaeren',
      zero: 0,
      false: false,
      photo: 'https://example.com/avatar.png',
    },
    'Personne',
  )
  assert.equal(result.title, 'Lucien Vervaeren')
  assert.equal(result.secondary, '0 Non')
  assert.equal(result.initials, 'LV')
  assert.equal(result.image, 'https://example.com/avatar.png')
  assert.equal(
    presentRecord(profile, { last: 'Vervaeren' }, 'Personne').title,
    'Vervaeren',
  )
  assert.equal(presentRecord(profile, {}, 'Personne').title, 'Personne')
})
test('initials ignore profile separators and preserve accented letters', () => {
  assert.equal(recordInitials('John · Doe'), 'JD')
  assert.equal(recordInitials('Élodie / Noël'), 'ÉN')
  assert.equal(recordInitials(' · '), '')
})

test('image rendering rejects executable and protocol-relative URLs', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:image/svg+xml;base64,foo',
    '//other.test/image',
    '/\\other.test/image',
    'http://other.test/image',
  ])
    assert.equal(safeImageUrl(value), null)
  assert.equal(safeImageUrl('/media/avatar.png'), '/media/avatar.png')
})
test('one relation generates forward and inverse navigation and a self-relation is counted once', () => {
  const relation = {
    id: 'relation',
    name: 'Personne affectée',
    inverse_name: 'Véhicules',
    target_type_ids: ['person'],
    source_max: 1,
    target_max: null,
  }
  const catalog = [
    {
      id: 'vehicle',
      name: 'Véhicule',
      configuration: { ...emptyConfig(), relations: [relation] },
    },
    { id: 'person', name: 'Personne', configuration: emptyConfig() },
  ]
  assert.deepEqual(navigations('person', catalog), [
    {
      id: 'relation',
      name: 'Véhicules',
      direction: 'incoming',
      type_ids: ['vehicle'],
      many: true,
    },
  ])
  assert.equal(navigations('vehicle', catalog)[0].many, false)
  relation.target_type_ids = ['vehicle']
  assert.equal(navigations('vehicle', catalog).length, 2)
  assert.equal(relationCount('vehicle', catalog), 1)
})
test('dependency detection finds profile and view references across types without matching labels', () => {
  const catalog = [
    {
      id: 'person',
      name: 'Personne',
      configuration: {
        ...emptyConfig(),
        display_profiles: [
          {
            id: 'profile',
            name: 'Compact',
            title_fields: ['first', 'last'],
            secondary_fields: [],
            image_field: null,
          },
        ],
      },
    },
    {
      id: 'vehicle',
      name: 'Véhicule',
      configuration: {
        ...emptyConfig(),
        views: [
          {
            id: 'view',
            name: 'Tableau',
            columns: [
              {
                id: 'column',
                label: 'first',
                relation_id: 'relation',
                profile_id: 'profile',
              },
            ],
          },
        ],
      },
    },
  ]
  assert.deepEqual(dependentDefinitions('first', catalog), [
    'Personne / Compact',
  ])
  assert.deepEqual(dependentDefinitions('profile', catalog), [
    'Véhicule / Tableau',
  ])
  assert.deepEqual(dependentDefinitions('relation', catalog), [
    'Véhicule / Tableau',
  ])
})
test('configuration catalog and versioned PUT capture organization and CSRF', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json([]),
  )
  api.setOrganization('other')
  const query = configurationCatalogQuery('org')
  const signal = new AbortController().signal
  await query.queryFn({ signal })
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/organization/entity-types/configuration/catalog')
  assert.equal(request.signal, signal)
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org')
  const config = emptyConfig()
  await saveConfiguration('org', 'type/one', 3, config)
  const [saveUrl, saveRequest] = fetch.mock.calls[1].arguments
  assert.equal(
    saveUrl,
    '/api/organization/entity-types/type%2Fone/configuration',
  )
  assert.equal(saveRequest.method, 'PUT')
  assert.deepEqual(JSON.parse(saveRequest.body), {
    expected_version: 3,
    configuration: config,
  })
  assert.equal(
    new Headers(saveRequest.headers).get('X-CSRF-Token'),
    'csrf-test',
  )
  assert.equal(new Headers(saveRequest.headers).get('X-Organization-ID'), 'org')
  assert.notDeepEqual(
    query.queryKey,
    configurationCatalogQuery('other').queryKey,
  )
})
test('version conflict and dependency validation details are visible without losing draft', () => {
  assert.match(
    configurationError(
      new ApiError(409, 'Conflict', [], 'Configuration version conflict'),
    ),
    /modifiée ailleurs/,
  )
  assert.equal(
    configurationError(
      new ApiError(422, 'Invalid', [], 'Le champ est utilisé ailleurs.'),
    ),
    'Le champ est utilisé ailleurs.',
  )
})

test('backend semantic error detail is retained by the shared API client', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ detail: 'Le profil est encore utilisé.' }, { status: 422 }),
  )
  await assert.rejects(
    saveConfiguration('org', 'type', 1, emptyConfig()),
    (error) =>
      error.status === 422 &&
      configurationError(error) === 'Le profil est encore utilisé.',
  )
})

test('image preview rejects control-character host escapes', () => {
  assert.equal(safeImageUrl('/\n/another.example/avatar.png'), null)
})

test('a table can display its own composite profile without inventing a relation', async () => {
  const { definitionError } = await import(configUrl)
  assert.equal(
    definitionError('views', {
      name: 'Personnes',
      columns: [
        {
          id: 'column',
          label: 'Nom complet',
          kind: 'display',
          field_id: null,
          relation_id: null,
          profile_id: 'compact',
        },
      ],
    }),
    null,
  )
  assert.notEqual(
    definitionError('views', {
      name: 'Véhicules',
      columns: [
        {
          id: 'column',
          label: 'Personne',
          kind: 'relation',
          relation_id: null,
        },
      ],
    }),
    null,
  )
})

test('adding a reusable profile preserves fields, relations, views and the existing default', () => {
  const configuration = {
    ...emptyConfig(),
    fields: [{ id: 'first' }, { id: 'last' }],
    relations: [{ id: 'rel' }],
    views: [{ id: 'view' }],
    display_profiles: [{ id: 'default', name: 'Compact', is_default: true }],
  }
  const before = structuredClone(configuration)
  const profile = {
    id: 'identity',
    name: 'Identité',
    title_fields: ['first', 'last'],
    secondary_fields: [],
    separator: ' ',
    image_field: null,
    is_default: false,
  }
  const result = withDisplayProfile(configuration, profile)
  assert.deepEqual(configuration, before)
  assert.deepEqual(result.fields, before.fields)
  assert.deepEqual(result.relations, before.relations)
  assert.deepEqual(result.views, before.views)
  assert.equal(result.display_profiles.length, 2)
  assert.deepEqual(
    result.display_profiles.find((item) => item.id === 'identity'),
    profile,
  )
  assert.deepEqual(
    result.display_profiles
      .filter((item) => item.is_default)
      .map((item) => item.id),
    ['default'],
  )
})
test('editing a shared profile keeps its identity and normalizes exactly one default', () => {
  const configuration = {
    ...emptyConfig(),
    display_profiles: [
      { id: 'compact', is_default: true },
      { id: 'identity', is_default: false },
    ],
  }
  const result = withDisplayProfile(configuration, {
    id: 'identity',
    name: 'Prénom Nom',
    is_default: true,
  })
  assert.equal(result.display_profiles.length, 2)
  assert.equal(result.display_profiles[1].name, 'Prénom Nom')
  assert.deepEqual(
    result.display_profiles
      .filter((item) => item.is_default)
      .map((item) => item.id),
    ['identity'],
  )
  assert.equal(configuration.display_profiles[0].is_default, true)
  assert.equal(
    withDisplayProfile(emptyConfig(), { id: 'first', is_default: false })
      .display_profiles[0].is_default,
    true,
  )
})
test('saving a related profile targets its own version and leaves the source draft unchanged', async (t) => {
  const target = {
    id: 'client',
    configuration_version: 7,
    configuration: emptyConfig(),
  }
  const sourceDraft = {
    ...emptyConfig(),
    views: [{ id: 'draft-view', columns: [] }],
  }
  const original = structuredClone(sourceDraft)
  const profile = {
    id: 'identity',
    name: 'Identité',
    title_fields: ['first', 'last'],
    secondary_fields: [],
    image_field: null,
    separator: ' ',
    is_default: true,
  }
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ ...target, configuration_version: 8 }),
  )
  await saveConfiguration(
    'org',
    target.id,
    target.configuration_version,
    withDisplayProfile(target.configuration, profile),
  )
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/organization/entity-types/client/configuration')
  assert.equal(request.method, 'PUT')
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org')
  assert.equal(new Headers(request.headers).get('X-CSRF-Token'), 'csrf-test')
  const body = JSON.parse(request.body)
  assert.equal(body.expected_version, 7)
  assert.equal(body.configuration.display_profiles[0].id, 'identity')
  assert.deepEqual(sourceDraft, original)
  assert.deepEqual(target.configuration, emptyConfig())
})

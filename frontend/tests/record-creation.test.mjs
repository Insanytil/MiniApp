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
const presentationUrl = await moduleUrl(
  '../src/features/entity-types/presentation.ts',
)
const apiSource = `import { createApiClient } from ${JSON.stringify(clientUrl)}; export const api = createApiClient({ baseUrl: '/api', readCookie: () => 'miniapp_csrf=csrf-test' });`
const apiUrl = `data:text/javascript;base64,${Buffer.from(apiSource).toString('base64')}`
const imports = {
  '@tanstack/react-query': import.meta.resolve('@tanstack/react-query'),
  '@/lib/api': apiUrl,
  '@/lib/api/client': clientUrl,
  '@/features/organizations/selection': selectionUrl,
  '@/components/data-table/server-pagination': paginationUrl,
}
const recordsUrl = await moduleUrl(
  '../src/features/entity-records/records.ts',
  imports,
)
const creationUrl = await moduleUrl(
  '../src/features/entity-records/creation.ts',
  {
    ...imports,
    './records': recordsUrl,
    '@/features/entity-types/presentation': presentationUrl,
  },
)
const { api } = await import(apiUrl)
const { ApiError } = await import(clientUrl)
const {
  creationSchemaQuery,
  createRecord,
  updateRecord,
  initialDraft,
  buildRecordPayload,
  recordOptions,
  relationKey,
  recordRootKey,
  createRecordError,
} = await import(creationUrl)
const field = (id, kind = 'text', required = false) => ({
  id,
  name: id,
  technical_name: id,
  kind,
  required,
})
const schema = {
  id: 'type',
  name: 'Personne',
  configuration_version: 3,
  fields: [
    field('name', 'text', true),
    field('zero', 'integer', true),
    field('false', 'boolean', true),
    field('decimal', 'decimal'),
  ],
  relations: [],
}

test('dynamic form preserves false, zero and decimal input and omits empty optional values', () => {
  const draft = initialDraft(schema)
  draft.values = {
    name: ' Lucien ',
    zero: '0',
    false: 'false',
    decimal: '1,5',
    unknown: 'not-sent',
  }
  const { payload, errors } = buildRecordPayload(schema, draft)
  assert.deepEqual(errors, {})
  assert.deepEqual(payload.values, {
    name: 'Lucien',
    zero: 0,
    false: false,
    decimal: 1.5,
  })
  assert.equal(payload.expected_configuration_version, 3)
  draft.values.decimal = ''
  assert.equal(
    'decimal' in buildRecordPayload(schema, draft).payload.values,
    false,
  )
})
test('invalid numbers, dates, emails and images are rejected before submission', () => {
  const fields = [
    field('integer', 'integer'),
    field('decimal', 'decimal'),
    field('date', 'date'),
    field('email', 'email'),
    field('image', 'image'),
  ]
  const current = { ...schema, fields }
  const result = buildRecordPayload(current, {
    values: {
      integer: '1.5',
      decimal: 'Infinity',
      date: '2023-02-29',
      email: 'invalid',
      image: 'javascript:alert(1)',
    },
    relations: {},
  })
  assert.deepEqual(
    Object.keys(result.errors),
    fields.map((f) => f.id),
  )
})
test('required scalar and relation errors are addressed to their controls', () => {
  const relation = {
    id: 'relation',
    direction: 'outgoing',
    many: false,
    required: true,
  }
  const current = { ...schema, relations: [relation] }
  const result = buildRecordPayload(current, initialDraft(current))
  assert.ok(result.errors.name)
  assert.ok(result.errors[relationKey(relation)])
})
test('multi and inverse selections are serialized as canonical relation identifiers without labels', () => {
  const relation = {
    id: 'relation',
    direction: 'incoming',
    many: true,
    required: false,
  }
  const current = { ...schema, fields: [], relations: [relation] }
  const draft = initialDraft(current)
  draft.relations[relationKey(relation)] = [
    { value: 'one', label: 'Véhicule 1' },
    { value: 'two', label: 'Véhicule 2' },
  ]
  const result = buildRecordPayload(current, draft)
  assert.deepEqual(result.payload.relations, [
    {
      relation_id: 'relation',
      direction: 'incoming',
      record_ids: ['one', 'two'],
    },
  ])
  relation.many = false
  assert.ok(buildRecordPayload(current, draft).errors[relationKey(relation)])
})
test('system-only type creates an empty values document and no implicit writable audit fields', () => {
  const current = { ...schema, fields: [], relations: [] }
  assert.deepEqual(buildRecordPayload(current, initialDraft(current)).payload, {
    expected_configuration_version: 3,
    values: {},
    relations: [],
  })
})
test('creation schema and POST capture organization, preserve version and use CSRF', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json(schema),
  )
  api.setOrganization('other')
  const query = creationSchemaQuery('org-a', 'type/one')
  const signal = new AbortController().signal
  await query.queryFn({ signal })
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/organization/entities/type%2Fone/creation-schema')
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org-a')
  assert.equal(request.signal, signal)
  const payload = {
    expected_configuration_version: 3,
    values: { name: 'Lucien' },
    relations: [],
  }
  await createRecord('org-a', 'type/one', payload)
  const [createUrl, createRequest] = fetch.mock.calls[1].arguments
  assert.equal(createUrl, '/api/organization/entities/type%2Fone/records')
  assert.equal(createRequest.method, 'POST')
  assert.deepEqual(JSON.parse(createRequest.body), payload)
  assert.equal(
    new Headers(createRequest.headers).get('X-CSRF-Token'),
    'csrf-test',
  )
  assert.equal(
    new Headers(createRequest.headers).get('X-Organization-ID'),
    'org-a',
  )
  assert.notDeepEqual(
    query.queryKey,
    creationSchemaQuery('org-b', 'type/one').queryKey,
  )
  assert.deepEqual(recordRootKey('org-a'), [
    'organizations',
    'org-a',
    'entity-records',
  ])
})
test('relation autocomplete uses server labels, polymorphic target names, direction and pagination', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      items: [
        {
          id: 'person',
          entity_type_id: 'person-type',
          title: 'Lucien Vervaeren',
          secondary: 'user@example.com',
        },
      ],
      pagination: { total: 50 },
    }),
  )
  const relation = {
    id: 'relation',
    direction: 'outgoing',
    target_types: [{ id: 'person-type', name: 'Personne' }],
  }
  const signal = new AbortController().signal
  const result = await recordOptions(
    'org',
    'type',
    relation,
    'Lucien Vervaeren',
    signal,
  )
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(
    url,
    '/api/organization/entities/type/record-options?relation_id=relation&direction=outgoing&page=1&page_size=20&search=Lucien+Vervaeren',
  )
  assert.equal(request.signal, signal)
  assert.equal(result.items[0].label, 'Lucien Vervaeren')
  assert.match(result.items[0].description, /Personne/)
  assert.equal(result.hasMore, true)
})
test('schema and relation conflicts propagate without retries or clearing the form payload', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { detail: 'Record schema version conflict' },
      { status: 409 },
    ),
  )
  const payload = {
    expected_configuration_version: 3,
    values: { name: 'Lucien' },
    relations: [],
  }
  await assert.rejects(createRecord('org', 'type', payload), (error) =>
    /Rechargez le formulaire/.test(createRecordError(error)),
  )
  assert.equal(payload.values.name, 'Lucien')
  assert.equal(fetch.mock.callCount(), 1)
  assert.match(
    createRecordError(
      new ApiError(409, 'Conflict', [
        { field: 'relation:one:incoming', message: 'Déjà affecté' },
      ]),
    ),
    /Déjà affecté/,
  )
})

test('edit draft preserves false, zero, selections and the raw optimistic timestamp', () => {
  const edit = {
    ...schema,
    record_id: 'record',
    updated_at: '2026-10-25T12:00:00.123456Z',
    values: { name: 'Lucien', zero: 0, false: false, decimal: 1.25 },
    selections: {},
  }
  const draft = initialDraft(edit)
  assert.equal(draft.values.zero, '0')
  assert.equal(draft.values.false, 'false')
  const result = buildRecordPayload(edit, draft)
  assert.equal(result.payload.expected_updated_at, edit.updated_at)
  assert.equal(result.payload.values.zero, 0)
  assert.equal(result.payload.values.false, false)
})
test('editing loads the scoped snapshot and sends PUT with CSRF and concurrency token', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ id: 'record' }),
  )
  const query = creationSchemaQuery('org', 'type', 'record/one')
  await query.queryFn({ signal: new AbortController().signal })
  assert.equal(
    fetch.mock.calls[0].arguments[0],
    '/api/organization/entities/type/records/record%2Fone/edit-schema',
  )
  const payload = {
    expected_configuration_version: 3,
    expected_updated_at: '2026-10-25T12:00:00.123456Z',
    values: {},
    relations: [],
  }
  await updateRecord('org', 'type', 'record/one', payload)
  const [url, request] = fetch.mock.calls[1].arguments
  assert.equal(url, '/api/organization/entities/type/records/record%2Fone')
  assert.equal(request.method, 'PUT')
  assert.deepEqual(JSON.parse(request.body), payload)
  assert.equal(new Headers(request.headers).get('X-CSRF-Token'), 'csrf-test')
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org')
  assert.notDeepEqual(
    query.queryKey,
    creationSchemaQuery('org', 'type', 'other').queryKey,
  )
})
test('edit autocomplete keeps the current record identity in the request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ items: [], pagination: { total: 0 } }),
  )
  await recordOptions(
    'org',
    'type',
    { id: 'relation', direction: 'outgoing', target_types: [] },
    '',
    new AbortController().signal,
    'record',
  )
  assert.match(fetch.mock.calls[0].arguments[0], /record_id=record/)
})

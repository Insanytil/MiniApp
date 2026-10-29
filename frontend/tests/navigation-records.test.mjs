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
const imports = {
  '@tanstack/react-query': import.meta.resolve('@tanstack/react-query'),
  '@/lib/api': apiUrl,
  '@/lib/api/client': clientUrl,
  '@/features/organizations/selection': selectionUrl,
  '@/components/data-table/server-pagination': paginationUrl,
}
const { api } = await import(apiUrl)
const {
  navigationQuery,
  saveNavigation,
  entries,
  insertNode,
  removeNode,
  replaceNode,
  moveNode,
  reorderNode,
  validateMenu,
  navigationError,
} = await import(
  await moduleUrl(
    '../src/features/organization-navigation/navigation.ts',
    imports,
  )
)
const { recordsQuery, recordDetailQuery, formatValue } = await import(
  await moduleUrl('../src/features/entity-records/records.ts', imports)
)
const link = (id, type = 'vehicle') => ({
  id,
  kind: 'entity',
  entity_type_id: type,
  label: null,
})
const category = (id, children = []) => ({
  id,
  kind: 'category',
  label: id,
  children,
})

test('menu edits preserve nested children, ordering and original data', () => {
  const initial = [category('fleet', [link('vehicles')]), category('hr')]
  const frozen = JSON.stringify(initial)
  const inserted = insertNode(
    initial,
    'fleet',
    category('nested', [link('cars')]),
  )
  assert.deepEqual(
    entries(inserted).map(({ node }) => node.id),
    ['fleet', 'vehicles', 'nested', 'cars', 'hr'],
  )
  const moved = moveNode(inserted, 'nested', 'hr')
  assert.equal(moved[1].children[0].children[0].id, 'cars')
  assert.deepEqual(
    reorderNode(moved, 'hr', -1).map((node) => node.id),
    ['hr', 'fleet'],
  )
  assert.equal(JSON.stringify(initial), frozen)
})
test('moving a category into itself or a descendant is rejected', () => {
  const nodes = [category('root', [category('child')])]
  assert.throws(() => moveNode(nodes, 'root', 'root'), /elle-même/)
  assert.throws(() => moveNode(nodes, 'root', 'child'), /enfants/)
  assert.throws(() => insertNode(nodes, 'missing', link('entry')), /n’existe/)
})
test('removing a category removes only navigation nodes, without changing type identifiers', () => {
  const nodes = [category('root', [link('one')]), link('two')]
  assert.deepEqual(removeNode(nodes, 'root'), [link('two')])
  assert.deepEqual(
    replaceNode(nodes, { ...nodes[0], label: 'Renamed' })[0].children,
    [link('one')],
  )
})
test('menu validates total count, depth, duplicate IDs and organization targets', () => {
  assert.throws(
    () => validateMenu([link('same'), link('same')], ['vehicle']),
    /unique/,
  )
  assert.throws(
    () => validateMenu([link('entry', 'outside')], ['vehicle']),
    /n’existe/,
  )
  assert.throws(
    () =>
      validateMenu(
        Array.from({ length: 201 }, (_, i) => category(String(i))),
        [],
      ),
    /200/,
  )
  let node = category('leaf')
  for (let i = 0; i < 7; i++) node = category(`parent-${i}`, [node])
  validateMenu([node], [])
  assert.throws(
    () => validateMenu([category('overflow', [node])], []),
    /8 niveaux/,
  )
})
test('menu GET and versioned PUT use captured organization and CSRF', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ version: 2, document: { nodes: [] } }),
  )
  api.setOrganization('other')
  const query = navigationQuery('org-a')
  const signal = new AbortController().signal
  await query.queryFn({ signal })
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/organization/navigation')
  assert.equal(request.signal, signal)
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org-a')
  const nodes = [category('fleet', [link('vehicles')])]
  await saveNavigation('org-a', 1, nodes)
  const [, saveRequest] = fetch.mock.calls[1].arguments
  assert.equal(saveRequest.method, 'PUT')
  assert.deepEqual(JSON.parse(saveRequest.body), {
    expected_version: 1,
    document: { schema_version: 1, nodes },
  })
  assert.equal(
    new Headers(saveRequest.headers).get('X-CSRF-Token'),
    'csrf-test',
  )
  assert.notDeepEqual(query.queryKey, navigationQuery('org-b').queryKey)
})
test('menu conflicts are propagated without retries or silently overwriting a newer version', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ detail: 'Navigation version conflict' }, { status: 409 }),
  )
  await assert.rejects(saveNavigation('org', 1, []), (error) =>
    /modifié ailleurs/.test(navigationError(error)),
  )
  assert.equal(fetch.mock.callCount(), 1)
})
test('record table uses server default-view columns, paginated scoped reads and cancellation', async (t) => {
  const response = {
    entity_type: { id: 'vehicle', name: 'Véhicule' },
    view: {
      id: 'default',
      name: 'Parc',
      columns: [{ id: 'assigned', label: 'Appartient à' }],
    },
    items: [
      {
        id: 'one',
        cells: {
          assigned: {
            kind: 'records',
            items: [{ title: 'Lucien Vervaeren' }],
            total: 1,
          },
        },
      },
    ],
    pagination: { total: 1 },
  }
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json(response),
  )
  api.setOrganization('new-selection')
  const params = { page: 2, pageSize: 20, search: 'Lucien + véhicule' }
  const query = recordsQuery('org-a', 'type/vehicle', params)
  const signal = new AbortController().signal
  const data = await query.queryFn({ signal })
  assert.deepEqual(data.view, response.view)
  assert.equal(data.items[0].cells.assigned.items[0].title, 'Lucien Vervaeren')
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(
    url,
    '/api/organization/entities/type%2Fvehicle/records?page=2&page_size=20&search=Lucien+%2B+v%C3%A9hicule',
  )
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org-a')
  assert.equal(request.signal, signal)
  assert.notDeepEqual(
    query.queryKey,
    recordsQuery('org-b', 'type/vehicle', params).queryKey,
  )
  assert.notDeepEqual(
    query.queryKey,
    recordsQuery('org-a', 'other-type', params).queryKey,
  )
})
test('record detail encodes IDs and preserves organization scope', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ id: 'record' }),
  )
  await recordDetailQuery('org', 'type/one', 'record/one').queryFn({
    signal: new AbortController().signal,
  })
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(
    url,
    '/api/organization/entities/type%2Fone/records/record%2Fone',
  )
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org')
})
test('display formatting preserves false and zero, dates and missing values', () => {
  assert.equal(formatValue(false), 'Non')
  assert.equal(formatValue(0), '0')
  assert.equal(formatValue(null), '—')
  assert.equal(formatValue('invalid', 'date'), 'invalid')
  assert.match(formatValue('2024-01-01', 'date'), /2024/)
})

test('numeric presentation preserves decimal precision and boolean API strings', () => {
  assert.equal(
    formatValue('12345678901234567890.012300', 'decimal'),
    '12\u202f345\u202f678\u202f901\u202f234\u202f567\u202f890,012300',
  )
  assert.equal(formatValue('-0.50', 'decimal'), '-0,50')
  assert.equal(formatValue('1250.00', 'decimal'), '1\u202f250,00')
  assert.equal(formatValue('true', 'boolean'), 'Oui')
  assert.equal(formatValue('false', 'boolean'), 'Non')
  assert.equal(formatValue('001250', 'text'), '001250')
})

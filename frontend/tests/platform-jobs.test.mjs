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
const apiSource = `import { createApiClient } from ${JSON.stringify(clientUrl)}; export const api = createApiClient({ baseUrl: '/api', readCookie: () => 'miniapp_csrf=csrf-token' });`
const apiUrl = `data:text/javascript;base64,${Buffer.from(apiSource).toString('base64')}`
const jobsUrl = await moduleUrl(
  '../src/features/platform-administration/jobs.ts',
  {
    '@tanstack/react-query': import.meta.resolve('@tanstack/react-query'),
    '@/lib/api': apiUrl,
    '@/components/data-table/server-pagination': paginationUrl,
  },
)
const {
  jobsQuery,
  batchJobsQuery,
  performJobAction,
  allowedJobActions,
  groupJobStatus,
} = await import(jobsUrl)
test('jobs query paginates, encodes search and forwards cancellation', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify({ items: [], pagination: { total: 0 } })),
  )
  const query = jobsQuery({ page: 2, pageSize: 50, search: 'a+b@example.com' })
  const signal = new AbortController().signal
  await query.queryFn({ signal })
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(
    url,
    '/api/platform/jobs?page=2&page_size=50&search=a%2Bb%40example.com',
  )
  assert.equal(request.signal, signal)
  assert.deepEqual(query.queryKey.slice(0, 2), ['platform', 'jobs'])
})
test('batch details use the batch endpoint and a separate cache key', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('[]'),
  )
  await batchJobsQuery('batch/1').queryFn({
    signal: new AbortController().signal,
  })
  assert.equal(
    fetch.mock.calls[0].arguments[0],
    '/api/platform/jobs/batches/batch%2F1',
  )
  assert.notDeepEqual(
    batchJobsQuery('one').queryKey,
    batchJobsQuery('two').queryKey,
  )
})
test('only queued jobs can be cancelled and only failed/cancelled jobs retried', () => {
  for (const status of [
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled',
  ])
    assert.deepEqual(allowedJobActions(status), {
      retry: ['failed', 'cancelled'].includes(status),
      cancel: status === 'queued',
    })
})
test('mixed batch states keep pending work visible before terminal errors', () => {
  const group = {
    queued_jobs: 0,
    running_jobs: 0,
    failed_jobs: 0,
    cancelled_jobs: 0,
  }
  assert.equal(groupJobStatus(group), 'succeeded')
  assert.equal(
    groupJobStatus({ ...group, failed_jobs: 1, cancelled_jobs: 1 }),
    'failed',
  )
  assert.equal(
    groupJobStatus({ ...group, failed_jobs: 1, queued_jobs: 1 }),
    'queued',
  )
  assert.equal(
    groupJobStatus({ ...group, running_jobs: 1, queued_jobs: 1 }),
    'running',
  )
})
test('retry and cancel use POST with session credentials and CSRF, preserve queued=false', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url) =>
    url.endsWith('/cancel')
      ? new Response(null, { status: 204 })
      : new Response('{"queued":false}'),
  )
  assert.deepEqual(await performJobAction('job/1', 'retry'), { queued: false })
  assert.equal(await performJobAction('job/1', 'cancel'), undefined)
  for (const call of fetch.mock.calls) {
    assert.equal(call.arguments[1].method, 'POST')
    assert.equal(call.arguments[1].credentials, 'include')
    assert.equal(
      new Headers(call.arguments[1].headers).get('X-CSRF-Token'),
      'csrf-token',
    )
  }
  assert.equal(
    fetch.mock.calls[0].arguments[0],
    '/api/platform/jobs/job%2F1/retry',
  )
})

test('organization job listing captures its scope and separates caches from platform and other organizations', async (t) => {
  const { api } = await import(apiUrl)
  api.setOrganization('another-selection')
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ items: [], pagination: { total: 0 } }),
  )
  const params = { page: 3, pageSize: 20, search: 'a+b@example.com' }
  const query = jobsQuery(params, 'org-a')
  const signal = new AbortController().signal
  await query.queryFn({ signal })
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(
    url,
    '/api/organization/jobs?page=3&page_size=20&search=a%2Bb%40example.com',
  )
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org-a')
  assert.equal(request.signal, signal)
  assert.notDeepEqual(query.queryKey, jobsQuery(params).queryKey)
  assert.notDeepEqual(query.queryKey, jobsQuery(params, 'org-b').queryKey)
})

test('organization batch details preserve scope and cancellation', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json([]),
  )
  const signal = new AbortController().signal
  const query = batchJobsQuery('batch/one', 'org-a')
  await query.queryFn({ signal })
  const [url, request] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/organization/jobs/batches/batch%2Fone')
  assert.equal(new Headers(request.headers).get('X-Organization-ID'), 'org-a')
  assert.equal(request.signal, signal)
  assert.notDeepEqual(
    query.queryKey,
    batchJobsQuery('batch/one', 'org-b').queryKey,
  )
})

for (const action of ['retry', 'cancel']) {
  test(`organization ${action} targets its captured organization with CSRF`, async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () =>
      action === 'cancel'
        ? new Response(null, { status: 204 })
        : Response.json({ queued: true }),
    )
    const { api } = await import(apiUrl)
    api.setOrganization('new-selection')
    await performJobAction('job/one', action, 'original-org')
    const [url, request] = fetch.mock.calls[0].arguments
    assert.equal(url, `/api/organization/jobs/job%2Fone/${action}`)
    assert.equal(request.method, 'POST')
    assert.equal(
      new Headers(request.headers).get('X-Organization-ID'),
      'original-org',
    )
    assert.equal(new Headers(request.headers).get('X-CSRF-Token'), 'csrf-token')
  })
}

test('empty organization scope fails instead of falling back to platform jobs', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json([]),
  )
  await assert.rejects(
    jobsQuery({ page: 1, pageSize: 20, search: '' }, '').queryFn({
      signal: new AbortController().signal,
    }),
    /organisation/,
  )
  assert.equal(fetch.mock.callCount(), 0)
})

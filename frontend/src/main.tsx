import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'

import { getRouter } from './router'
import { queryClient } from './lib/query-client'
import { api } from './lib/api'
import { sessionKey } from './features/auth/session'
import { clearOrganizationSelection } from './features/organizations/selection'

const router = getRouter()

api.setUnauthorizedHandler(() => {
  // A failed login or the initial anonymous session check must not trigger this.
  if (!queryClient.getQueryData(sessionKey)) return
  clearOrganizationSelection()
  api.setOrganization(null)
  // Let /auth/me finish and return null; cancel and discard all business data.
  void queryClient.cancelQueries({
    predicate: (query) => query.queryKey[0] !== 'auth',
  })
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== 'auth',
  })
  queryClient.getMutationCache().clear()
  queryClient.setQueryData(sessionKey, null)
  void router.navigate({ to: '/login', replace: true })
  void router.invalidate()
})

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

import { createFileRoute, Outlet } from '@tanstack/react-router'

import { AppShell } from '@/components/layout/app-shell'
import { requireAuthentication } from '@/features/auth'

export const Route = createFileRoute('/_protected')({
  beforeLoad: ({ context }) => requireAuthentication(context.queryClient),
  component: ProtectedLayout,
})

function ProtectedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

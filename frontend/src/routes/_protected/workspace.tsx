import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'
import { requireOrganizationMember, useAuth } from '@/features/auth'

export const Route = createFileRoute('/_protected/workspace')({
  beforeLoad: ({ context }) => requireOrganizationMember(context.queryClient),
  component: WorkspaceLayout,
})
function WorkspaceLayout() {
  const { organization } = useAuth()
  return organization ? <Outlet /> : <Navigate to="/home" replace />
}

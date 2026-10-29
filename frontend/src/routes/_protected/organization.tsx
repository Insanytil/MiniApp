import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'
import { requireOrganizationAdmin, useAuth } from '@/features/auth'

export const Route = createFileRoute('/_protected/organization')({
  beforeLoad: ({ context }) => requireOrganizationAdmin(context.queryClient),
  component: OrganizationAdminLayout,
})
function OrganizationAdminLayout() {
  const { user, organization } = useAuth()
  return !user.is_superuser && organization?.role === 'organization_admin' ? (
    <Outlet />
  ) : (
    <Navigate to="/home" replace />
  )
}

import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'
import { requirePlatformAdmin, useAuth } from '@/features/auth'

export const Route = createFileRoute('/_protected/platform')({
  beforeLoad: ({ context }) => requirePlatformAdmin(context.queryClient),
  component: PlatformLayout,
})

function PlatformLayout() {
  const { user } = useAuth()
  return user.is_superuser ? <Outlet /> : <Navigate to="/home" replace />
}

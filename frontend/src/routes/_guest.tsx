import { createFileRoute, Outlet } from '@tanstack/react-router'

import { requireGuest } from '@/features/auth'

export const Route = createFileRoute('/_guest')({
  beforeLoad: ({ context }) => requireGuest(context.queryClient),
  component: Outlet,
})

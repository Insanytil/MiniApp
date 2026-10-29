import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionQuery } from '@/features/auth/session'

export const Route = createFileRoute('/_neutral/')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(sessionQuery)
    throw redirect({ to: user ? '/home' : '/login', replace: true })
  },
})

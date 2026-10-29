import { createFileRoute } from '@tanstack/react-router'
import { UsersPage } from '@/features/platform-administration/components/users-page'

export const Route = createFileRoute('/_protected/platform/users')({
  component: UsersPage,
})

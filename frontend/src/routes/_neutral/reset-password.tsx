import { createFileRoute } from '@tanstack/react-router'
import { PasswordLinkPage } from '@/features/auth/components/password-link-page'
import { parsePasswordLinkSearch } from '@/features/auth/password-links'

export const Route = createFileRoute('/_neutral/reset-password')({
  validateSearch: parsePasswordLinkSearch,
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token } = Route.useSearch()
  return <PasswordLinkPage key={token ?? ''} kind="reset" token={token} />
}

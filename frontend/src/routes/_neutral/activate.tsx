import { createFileRoute } from '@tanstack/react-router'
import { PasswordLinkPage } from '@/features/auth/components/password-link-page'
import { parsePasswordLinkSearch } from '@/features/auth/password-links'

export const Route = createFileRoute('/_neutral/activate')({
  validateSearch: parsePasswordLinkSearch,
  component: ActivationPage,
})

function ActivationPage() {
  const { token } = Route.useSearch()
  return <PasswordLinkPage key={token ?? ''} kind="activation" token={token} />
}

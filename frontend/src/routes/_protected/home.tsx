import { createFileRoute } from '@tanstack/react-router'
import { Building2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/_protected/home')({
  component: HomePage,
})

function HomePage() {
  const { user, organization } = useAuth()
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Bienvenue dans votre espace
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {organization
            ? `Vous travaillez dans l’organisation ${organization.name}.`
            : user.is_superuser
              ? 'Vous êtes connecté à l’administration de la plateforme.'
              : 'Votre compte n’est associé à aucune organisation active.'}
        </p>
      </div>
      <Card className="max-w-2xl">
        <CardContent className="flex items-start gap-4 py-2">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
            {organization ? (
              <Building2 aria-hidden="true" className="size-5" />
            ) : (
              <ShieldCheck aria-hidden="true" className="size-5" />
            )}
          </div>
          <div className="min-w-0 space-y-3">
            <h2 className="text-lg font-medium">
              {organization?.name ??
                (user.is_superuser
                  ? 'Administration de la plateforme'
                  : 'Aucune organisation')}
            </h2>
            <p className="break-words text-sm text-muted-foreground">
              {organization
                ? 'Utilisez le menu pour naviguer dans votre espace de travail.'
                : user.is_superuser
                  ? 'Vous pouvez accéder à cet espace sans adhésion à une organisation.'
                  : 'Contactez votre administrateur pour rejoindre une organisation.'}
            </p>
            {organization && (
              <Badge variant="secondary">
                {organization.role === 'organization_admin'
                  ? 'Administrateur de l’organisation'
                  : 'Utilisateur de l’organisation'}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

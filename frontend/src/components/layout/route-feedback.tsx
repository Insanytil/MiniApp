import { Link, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { errorMessage } from '@/lib/api/client'

export function RoutePending() {
  return (
    <main
      className="flex min-h-svh items-center justify-center gap-3 bg-muted/30 p-6"
      role="status"
    >
      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      <span>Vérification de votre session…</span>
    </main>
  )
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-5">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 pt-2">
          <h1 className="text-xl font-semibold">
            Impossible de charger cette page
          </h1>
          <p role="alert" className="text-sm text-muted-foreground">
            {errorMessage(error)}
          </p>
          <Button
            onClick={() => {
              reset()
              void router.invalidate()
            }}
          >
            Réessayer
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

export function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-5 p-6">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <Link to="/home" className="underline underline-offset-4">
        Revenir à l’accueil
      </Link>
    </main>
  )
}

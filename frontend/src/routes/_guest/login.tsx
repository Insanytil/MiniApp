import { createFileRoute } from '@tanstack/react-router'

import { Card, CardContent } from '@/components/ui/card'
import { LoginForm } from '@/features/auth/components/login-form'

export const Route = createFileRoute('/_guest/login')({
  component: LoginPage,
})

function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-5 py-10 sm:px-8">
      <section aria-labelledby="login-title" className="w-full max-w-md">
        <h1
          id="login-title"
          className="mb-8 text-center text-3xl font-semibold tracking-tight"
        >
          MiniApp
        </h1>
        <Card className="rounded-2xl py-6 shadow-sm sm:py-8">
          <CardContent className="px-5 sm:px-8">
            <LoginForm />
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

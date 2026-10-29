import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import {
  Building2,
  ListTodo,
  Home,
  LoaderCircle,
  LogOut,
  Menu,
  Settings2,
  Users,
} from 'lucide-react'
import { OrganizationMenu } from '@/features/organization-navigation/components/organization-menu'
import { AuthProvider, useAuth } from '@/features/auth/auth-context'
import { sessionQuery } from '@/features/auth/session'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useLogout } from '@/features/auth/mutations'
import { errorMessage } from '@/lib/api/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

export function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useSuspenseQuery(sessionQuery)
  if (!user) return <Navigate to="/login" replace />
  return (
    <AuthProvider key={user.id} user={user}>
      <AppShellContent>{children}</AppShellContent>
    </AuthProvider>
  )
}

function AppShellContent({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, organization } = useAuth()
  const logout = useLogout()

  function sidebar(mobile = false) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b px-5 py-6">
          <p className="text-xl font-semibold tracking-tight">MiniApp</p>
        </div>
        <div className="space-y-3 border-b p-5">
          <Label htmlFor={mobile ? 'mobile-organization' : 'organization'}>
            Organisation
          </Label>
          {user.organizations.length ? (
            <OrganizationSelect mobile={mobile} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {user.is_superuser
                ? 'Espace plateforme'
                : 'Aucune organisation active'}
            </p>
          )}
          {organization && (
            <p className="text-xs text-muted-foreground">
              {organization.role === 'organization_admin'
                ? 'Administrateur'
                : 'Utilisateur'}
            </p>
          )}
        </div>
        <nav
          aria-label={mobile ? 'Navigation mobile' : 'Navigation principale'}
          className="flex-1 overflow-y-auto p-3"
        >
          <Link
            to="/home"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
            activeProps={{ className: 'bg-accent text-accent-foreground' }}
          >
            <Home className="size-4" aria-hidden="true" />
            Accueil
          </Link>
          <OrganizationMenu onNavigate={() => setMenuOpen(false)} />
          {!user.is_superuser &&
            organization?.role === 'organization_admin' && (
              <div className="mt-6 space-y-1">
                <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">
                  Administration de l’organisation
                </p>
                <Link
                  to="/organization/users"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
                  activeProps={{
                    className: 'bg-accent text-accent-foreground',
                  }}
                >
                  <Users className="size-4" aria-hidden="true" />
                  Utilisateurs
                </Link>
                <Link
                  to="/organization/jobs"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
                  activeProps={{
                    className: 'bg-accent text-accent-foreground',
                  }}
                >
                  <ListTodo className="size-4" aria-hidden="true" />
                  Jobs
                </Link>
                <Link
                  to="/organization/configuration"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
                  activeProps={{
                    className: 'bg-accent text-accent-foreground',
                  }}
                >
                  <Settings2 className="size-4" aria-hidden="true" />
                  Configuration
                </Link>
              </div>
            )}
          {user.is_superuser && (
            <div className="mt-6 space-y-1">
              <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">
                Administration
              </p>
              <Link
                to="/platform/organizations"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
                activeProps={{ className: 'bg-accent text-accent-foreground' }}
              >
                <Building2 className="size-4" aria-hidden="true" />
                Organisations
              </Link>
              <Link
                to="/platform/jobs"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
                activeProps={{ className: 'bg-accent text-accent-foreground' }}
              >
                <ListTodo className="size-4" aria-hidden="true" />
                Jobs
              </Link>
              <Link
                to="/platform/users"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent"
                activeProps={{ className: 'bg-accent text-accent-foreground' }}
              >
                <Users className="size-4" aria-hidden="true" />
                Utilisateurs
              </Link>
            </div>
          )}
        </nav>
        <div className="space-y-4 border-t p-4">
          <div className="min-w-0 space-y-2 px-1">
            <p className="truncate text-sm font-medium" title={user.email}>
              {user.email}
            </p>
            {user.is_superuser && (
              <Badge variant="secondary">PlatformAdmin</Badge>
            )}
          </div>
          {logout.isError && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(logout.error)}</AlertDescription>
            </Alert>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            {logout.isPending ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <LogOut className="size-4" aria-hidden="true" />
            )}
            {logout.isPending ? 'Déconnexion…' : 'Se déconnecter'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-dvh overflow-hidden bg-muted/20">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded bg-background p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Aller au contenu
      </a>
      <aside
        aria-label="Menu latéral"
        className="fixed inset-y-0 left-0 hidden w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block"
      >
        {sidebar()}
      </aside>
      <div className="flex h-full min-h-0 min-w-0 flex-col md:pl-64">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 sm:px-6 md:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  aria-label="Ouvrir le menu"
                />
              }
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(85vw,20rem)] gap-0">
              <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Organisation, navigation et déconnexion.
              </SheetDescription>
              {sidebar(true)}
            </SheetContent>
          </Sheet>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-auto p-4 outline-none sm:p-6 lg:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  )
}

function OrganizationSelect({ mobile }: { mobile: boolean }) {
  const { user, organization, selectOrganization } = useAuth()
  return (
    <NativeSelect
      id={mobile ? 'mobile-organization' : 'organization'}
      aria-label="Organisation active"
      className="w-full [&_select]:h-10"
      value={organization?.id ?? ''}
      onChange={(event) => selectOrganization(event.target.value)}
    >
      {user.organizations.map((item) => (
        <NativeSelectOption key={item.id} value={item.id}>
          {item.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

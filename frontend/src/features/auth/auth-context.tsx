import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { CurrentUser, UserOrganization } from './session'
import { api } from '@/lib/api'
import {
  readOrganizationSelection,
  resolveOrganization,
  saveOrganizationSelection,
} from '@/features/organizations/selection'

interface AuthContextValue {
  user: CurrentUser
  organization: UserOrganization | null
  selectOrganization: (id: string) => void
  registerOrganizationChangeGuard: (
    guard: (id: string) => boolean,
  ) => () => void
}
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  user,
  children,
}: {
  user: CurrentUser
  children: ReactNode
}) {
  const [selectedId, setSelectedId] = useState(() =>
    readOrganizationSelection(user.id),
  )
  const organizationGuard = useRef<((id: string) => boolean) | null>(null)
  const registerOrganizationChangeGuard = useCallback(
    (guard: (id: string) => boolean) => {
      organizationGuard.current = guard
      return () => {
        if (organizationGuard.current === guard)
          organizationGuard.current = null
      }
    },
    [],
  )
  const organization = resolveOrganization(user, selectedId)
  const organizationId = organization?.id ?? null

  useEffect(() => {
    api.setOrganization(organizationId)
    saveOrganizationSelection(user.id, organizationId)
    return () => api.setOrganization(null)
  }, [organizationId, user.id])

  function selectOrganization(id: string) {
    if (
      id === organizationId ||
      !user.organizations.some((item) => item.id === id)
    )
      return
    if (organizationGuard.current && !organizationGuard.current(id)) return
    // Update the scope immediately, before the next route/query is mounted.
    api.setOrganization(id)
    saveOrganizationSelection(user.id, id)
    setSelectedId(id)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        selectOrganization,
        registerOrganizationChangeGuard,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context)
    throw new Error('useAuth doit être utilisé dans une route protégée.')
  return context
}

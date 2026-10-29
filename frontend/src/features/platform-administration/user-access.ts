import type { PlatformUser } from './users'

export function membershipAccessState(
  user: Pick<PlatformUser, 'is_active' | 'is_verified'>,
  membership: PlatformUser['memberships'][number],
) {
  if (!membership.is_active)
    return {
      label: 'Accès désactivé',
      active: false,
      reason:
        'L’accès de cet utilisateur à cette organisation a été désactivé.',
    }
  if (!membership.organization_is_active)
    return {
      label: 'Organisation suspendue',
      active: false,
      reason: 'L’adhésion est active, mais l’organisation est suspendue.',
    }
  if (!user.is_active)
    return {
      label: 'Compte suspendu',
      active: false,
      reason:
        'L’adhésion est active, mais le compte utilisateur est suspendu dans toute l’application.',
    }
  if (!user.is_verified)
    return {
      label: 'Activation en attente',
      active: false,
      reason:
        'L’adhésion est active, mais le compte doit être activé par e-mail.',
    }
  return {
    label: 'Accès actif',
    active: true,
    reason: 'Le compte, l’organisation et l’adhésion sont actifs.',
  }
}

export function filterUserMemberships(
  memberships: PlatformUser['memberships'],
  search: string,
) {
  const normalize = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  const term = normalize(search.trim())
  return term
    ? memberships.filter((membership) =>
        normalize(
          `${membership.organization_name} ${membership.organization_slug}`,
        ).includes(term),
      )
    : memberships
}

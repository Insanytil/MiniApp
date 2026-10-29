import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ApiError, errorMessage } from '@/lib/api/client'
import { organizationQueryKey } from '@/features/organizations/selection'

export type MenuNode =
  | {
      id: string
      kind: 'category'
      label: string
      icon?: string | null
      children: MenuNode[]
    }
  | {
      id: string
      kind: 'entity'
      label: string | null
      icon?: string | null
      entity_type_id: string
    }
export interface MenuDocument {
  schema_version: 1
  nodes: MenuNode[]
}
export interface MenuResponse {
  version: number
  document: MenuDocument
  resolved_nodes: MenuNode[]
  entity_types: { id: string; name: string; technical_name: string }[]
}
export const navigationKey = (organizationId: string) =>
  organizationQueryKey(organizationId, 'navigation')
export const navigationQuery = (organizationId: string) =>
  queryOptions({
    queryKey: navigationKey(organizationId),
    queryFn: ({ signal }) =>
      api.request<MenuResponse>('/organization/navigation', {
        organizationId,
        organizationScoped: true,
        signal,
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
export function saveNavigation(
  organizationId: string,
  version: number,
  nodes: MenuNode[],
) {
  return api.request<MenuResponse>('/organization/navigation', {
    method: 'PUT',
    organizationId,
    organizationScoped: true,
    body: { expected_version: version, document: { schema_version: 1, nodes } },
  })
}
export function navigationError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return 'Le menu a été modifié ailleurs. Rechargez la version enregistrée avant de réessayer.'
    if (error.issues.length)
      return error.issues.map((issue) => issue.message).join(' · ')
    if (error.status === 422 && error.detail) return error.detail
  }
  return errorMessage(error)
}
export function entries(
  nodes: MenuNode[],
  parentId: string | null = null,
  depth = 0,
): { node: MenuNode; parentId: string | null; depth: number; index: number }[] {
  return nodes.flatMap((node, index) => [
    { node, parentId, depth, index },
    ...(node.kind === 'category'
      ? entries(node.children, node.id, depth + 1)
      : []),
  ])
}
export function removeNode(nodes: MenuNode[], id: string): MenuNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) =>
      node.kind === 'category'
        ? { ...node, children: removeNode(node.children, id) }
        : node,
    )
}
export function replaceNode(nodes: MenuNode[], updated: MenuNode): MenuNode[] {
  return nodes.map((node) =>
    node.id === updated.id
      ? updated
      : node.kind === 'category'
        ? { ...node, children: replaceNode(node.children, updated) }
        : node,
  )
}
export function insertNode(
  nodes: MenuNode[],
  parentId: string | null,
  item: MenuNode,
): MenuNode[] {
  if (!parentId) return [...nodes, item]
  if (
    !entries(nodes).some(
      ({ node }) => node.id === parentId && node.kind === 'category',
    )
  )
    throw new Error('La catégorie de destination n’existe plus.')
  return nodes.map((node) =>
    node.kind === 'category'
      ? {
          ...node,
          children:
            node.id === parentId
              ? [...node.children, item]
              : insertIfPresent(node.children, parentId, item),
        }
      : node,
  )
}
function insertIfPresent(nodes: MenuNode[], parentId: string, item: MenuNode) {
  return entries(nodes).some(({ node }) => node.id === parentId)
    ? insertNode(nodes, parentId, item)
    : nodes
}
export function moveNode(
  nodes: MenuNode[],
  id: string,
  parentId: string | null,
): MenuNode[] {
  const item = entries(nodes).find(({ node }) => node.id === id)?.node
  if (!item) throw new Error('Cet élément n’existe plus.')
  if (
    parentId === id ||
    (item.kind === 'category' &&
      entries(item.children).some(({ node }) => node.id === parentId))
  )
    throw new Error(
      'Une catégorie ne peut pas être déplacée dans elle-même ou dans un de ses enfants.',
    )
  return insertNode(removeNode(nodes, id), parentId, item)
}
export function reorderNode(
  nodes: MenuNode[],
  id: string,
  offset: number,
): MenuNode[] {
  const index = nodes.findIndex((node) => node.id === id)
  if (index >= 0) {
    const next = [...nodes]
    const target = index + offset
    if (target >= 0 && target < nodes.length)
      [next[index], next[target]] = [next[target], next[index]]
    return next
  }
  return nodes.map((node) =>
    node.kind === 'category'
      ? { ...node, children: reorderNode(node.children, id, offset) }
      : node,
  )
}
export function validateMenu(nodes: MenuNode[], typeIds: string[]) {
  const flat = entries(nodes)
  if (flat.length > 200 || flat.some((item) => item.depth >= 8))
    throw new Error('Le menu est limité à 200 éléments et 8 niveaux.')
  const seen = new Set<string>()
  for (const { node } of flat) {
    if (seen.has(node.id))
      throw new Error('Chaque élément doit avoir un identifiant unique.')
    seen.add(node.id)
    if (node.kind === 'entity' && !typeIds.includes(node.entity_type_id))
      throw new Error('Un type d’entité du menu n’existe plus.')
  }
}

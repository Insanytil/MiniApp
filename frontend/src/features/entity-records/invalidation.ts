import type { QueryClient } from '@tanstack/react-query'
import { filesKey } from '@/features/files/api'
import { recordRootKey } from './creation'

/**
 * Refresh everything derived from record contents after records change:
 * the records themselves and the files, whose usage counts depend on which
 * records link them.
 */
export const invalidateRecordData = (
  client: QueryClient,
  organizationId: string,
) =>
  Promise.all([
    client.invalidateQueries({ queryKey: recordRootKey(organizationId) }),
    client.invalidateQueries({ queryKey: filesKey(organizationId) }),
  ]).then(() => undefined)

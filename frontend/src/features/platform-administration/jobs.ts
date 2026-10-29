import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { listSearchParams } from '@/components/data-table/server-pagination'
import type {
  ListParams,
  PageResponse,
} from '@/components/data-table/server-pagination'

export type JobStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type JobType = 'account_verification_email' | 'password_reset_email'
export interface JobGroup {
  id: string
  batch_id: string | null
  organization_id: string | null
  organization_name: string | null
  triggered_by_user_id: string | null
  triggered_by_email: string | null
  recipient_email: string | null
  type: JobType
  total_jobs: number
  queued_jobs: number
  running_jobs: number
  succeeded_jobs: number
  failed_jobs: number
  cancelled_jobs: number
  attempts: number
  max_attempts: number
  last_error: string | null
  created_at: string
  latest_activity_at: string
}
export interface Job extends Pick<
  JobGroup,
  | 'id'
  | 'batch_id'
  | 'organization_id'
  | 'organization_name'
  | 'triggered_by_user_id'
  | 'triggered_by_email'
  | 'recipient_email'
  | 'type'
  | 'attempts'
  | 'max_attempts'
  | 'last_error'
  | 'created_at'
> {
  status: JobStatus
  started_at: string | null
  finished_at: string | null
}
export const jobKeys = ['platform', 'jobs'] as const
export const jobStatusLabels: Record<JobStatus, string> = {
  queued: 'En attente',
  running: 'En cours',
  succeeded: 'Terminé',
  failed: 'Échec',
  cancelled: 'Annulé',
}
export const jobTypeLabels: Record<JobType, string> = {
  account_verification_email: 'Activation de compte',
  password_reset_email: 'Réinitialisation du mot de passe',
}
export function groupJobStatus(group: JobGroup): JobStatus {
  if (group.running_jobs) return 'running'
  if (group.queued_jobs) return 'queued'
  if (group.failed_jobs) return 'failed'
  if (group.cancelled_jobs) return 'cancelled'
  return 'succeeded'
}
export function allowedJobActions(status: JobStatus) {
  return {
    retry: status === 'failed' || status === 'cancelled',
    cancel: status === 'queued',
  }
}
// Organization IDs are captured by every request and cache key, independent of
// the currently selected organization when an in-flight request completes.
export function jobScopeKey(organizationId?: string) {
  return organizationId === undefined
    ? jobKeys
    : (['organizations', organizationId, 'jobs'] as const)
}
function jobPath(organizationId?: string) {
  return organizationId === undefined ? '/platform/jobs' : '/organization/jobs'
}
function jobScope(organizationId?: string) {
  return { organizationId, organizationScoped: organizationId !== undefined }
}
export const jobsQuery = (params: ListParams, organizationId?: string) =>
  queryOptions({
    queryKey: [...jobScopeKey(organizationId), 'list', params],
    queryFn: ({ signal }) =>
      api.request<PageResponse<JobGroup>>(
        `${jobPath(organizationId)}?${listSearchParams(params)}`,
        { ...jobScope(organizationId), signal },
      ),
    refetchInterval: 15_000,
  })
export const batchJobsQuery = (batchId: string, organizationId?: string) =>
  queryOptions({
    queryKey: [...jobScopeKey(organizationId), 'batch', batchId],
    queryFn: ({ signal }) =>
      api.request<Job[]>(
        `${jobPath(organizationId)}/batches/${encodeURIComponent(batchId)}`,
        { ...jobScope(organizationId), signal },
      ),
    refetchInterval: 15_000,
  })
export function performJobAction(
  id: string,
  action: 'retry' | 'cancel',
  organizationId?: string,
) {
  return api.request<{ queued: boolean } | undefined>(
    `${jobPath(organizationId)}/${encodeURIComponent(id)}/${action}`,
    { method: 'POST', ...jobScope(organizationId) },
  )
}

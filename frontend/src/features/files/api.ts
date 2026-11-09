import { api } from '@/lib/api'

export interface StoredFile {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  state: 'pending' | 'ready' | 'deleted'
  created_at: string
  is_selectable: boolean
}

interface UploadTicket {
  file: StoredFile
  url: string
  fields: Record<string, string>
  expires_in: number
}

export async function uploadFile(
  file: File,
  organizationId: string,
  signal?: AbortSignal,
  filename = file.name,
): Promise<StoredFile> {
  const ticket = await api.request<UploadTicket>(
    '/organization/files/uploads',
    {
      method: 'POST',
      organizationId,
      body: {
        filename,
        content_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
      },
      signal,
    },
  )
  try {
    const body = new FormData()
    for (const [key, value] of Object.entries(ticket.fields))
      body.append(key, value)
    // S3 requires the file to be the last form field.
    body.append('file', file)
    const response = await fetch(ticket.url, {
      method: 'POST',
      body,
      credentials: 'omit',
      signal,
    })
    if (!response.ok) throw new Error('Le dépôt du fichier a échoué.')
    return await api.request<StoredFile>(
      `/organization/files/${ticket.file.id}/complete`,
      {
        method: 'POST',
        organizationId,
        signal,
      },
    )
  } catch (error) {
    // Cleanup is best effort; the bucket also expires pending objects after one day.
    await deleteFile(ticket.file.id, organizationId).catch(() => undefined)
    throw error
  }
}

export const filesKey = (organizationId: string) =>
  ['organizations', organizationId, 'files'] as const

export function listFiles(
  organizationId: string,
  offset = 0,
  limit = 50,
  options: { search?: string; imagesOnly?: boolean; signal?: AbortSignal } = {},
) {
  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  })
  if (options.search?.trim()) query.set('search', options.search.trim())
  if (options.imagesOnly) query.set('images_only', 'true')
  return api.request<StoredFile[]>(`/organization/files?${query}`, {
    organizationId,
    signal: options.signal,
  })
}

export function getFileDownload(
  id: string,
  organizationId: string,
  preview = false,
) {
  return api.request<{ url: string; expires_in: number }>(
    `/organization/files/${id}/download?preview=${preview}`,
    {
      organizationId,
    },
  )
}

export function deleteFile(id: string, organizationId: string) {
  return api.request<void>(`/organization/files/${id}`, {
    method: 'DELETE',
    organizationId,
  })
}

export interface ManagedFile extends StoredFile {
  usage_count: number
}
export interface FileManagerResult {
  items: ManagedFile[]
  total: number
  offset: number
  limit: number
}

export function listManagedFiles(
  organizationId: string,
  options: {
    offset: number
    limit: number
    search?: string
    linked?: boolean
    selectable?: boolean
    signal?: AbortSignal
  },
) {
  const query = new URLSearchParams({
    offset: String(options.offset),
    limit: String(options.limit),
  })
  if (options.search?.trim()) query.set('search', options.search.trim())
  if (options.linked !== undefined) query.set('linked', String(options.linked))
  if (options.selectable !== undefined)
    query.set('selectable', String(options.selectable))
  return api.request<FileManagerResult>(`/organization/files/manage?${query}`, {
    organizationId,
    signal: options.signal,
  })
}

export function renameFile(
  id: string,
  organizationId: string,
  filename: string,
) {
  return api.request<StoredFile>(`/organization/files/${id}/name`, {
    method: 'PUT',
    organizationId,
    body: { filename },
  })
}

export function setFileAvailability(
  id: string,
  organizationId: string,
  isSelectable: boolean,
) {
  return api.request<StoredFile>(`/organization/files/${id}/availability`, {
    method: 'PATCH',
    organizationId,
    body: { is_selectable: isSelectable },
  })
}

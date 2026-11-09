import { api } from '@/lib/api'

export interface StoredFile {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  state: 'pending' | 'ready' | 'deleted'
  created_at: string
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
): Promise<StoredFile> {
  const ticket = await api.request<UploadTicket>(
    '/organization/files/uploads',
    {
      method: 'POST',
      organizationId,
      body: {
        filename: file.name,
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

export function listFiles(organizationId: string, offset = 0, limit = 50) {
  return api.request<StoredFile[]>(
    `/organization/files?offset=${offset}&limit=${limit}`,
    {
      organizationId,
    },
  )
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

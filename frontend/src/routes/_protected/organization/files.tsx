import { createFileRoute } from '@tanstack/react-router'
import { FileManagerPage } from '@/features/files/file-manager-page'

export const Route = createFileRoute('/_protected/organization/files')({
  component: FileManagerPage,
})

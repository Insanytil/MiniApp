import {
  Folder,
  Database,
  Users,
  UserRound,
  Building2,
  BriefcaseBusiness,
  Receipt,
  Wallet,
  CreditCard,
  ShoppingCart,
  Package,
  Truck,
  CalendarDays,
  ClipboardList,
  FileText,
  ChartColumn,
  GraduationCap,
  Wrench,
  Settings2,
  Heart,
  House,
  Mail,
  Star,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const icons = [
  { id: 'folder', label: 'Dossier', Icon: Folder },
  { id: 'database', label: 'Données', Icon: Database },
  { id: 'users', label: 'Utilisateurs', Icon: Users },
  { id: 'user-round', label: 'Contact', Icon: UserRound },
  { id: 'building-2', label: 'Entreprise', Icon: Building2 },
  { id: 'briefcase-business', label: 'Projets', Icon: BriefcaseBusiness },
  { id: 'receipt', label: 'Factures', Icon: Receipt },
  { id: 'wallet', label: 'Finances', Icon: Wallet },
  { id: 'credit-card', label: 'Paiements', Icon: CreditCard },
  { id: 'shopping-cart', label: 'Commandes', Icon: ShoppingCart },
  { id: 'package', label: 'Articles', Icon: Package },
  { id: 'truck', label: 'Livraisons', Icon: Truck },
  { id: 'calendar-days', label: 'Calendrier', Icon: CalendarDays },
  { id: 'clipboard-list', label: 'Tâches', Icon: ClipboardList },
  { id: 'file-text', label: 'Documents', Icon: FileText },
  { id: 'chart-column', label: 'Statistiques', Icon: ChartColumn },
  { id: 'graduation-cap', label: 'Formation', Icon: GraduationCap },
  { id: 'wrench', label: 'Interventions', Icon: Wrench },
  { id: 'settings-2', label: 'Réglages', Icon: Settings2 },
  { id: 'heart', label: 'Santé', Icon: Heart },
  { id: 'house', label: 'Accueil', Icon: House },
  { id: 'mail', label: 'Messages', Icon: Mail },
  { id: 'star', label: 'Favoris', Icon: Star },
  { id: 'tag', label: 'Étiquette', Icon: Tag },
]

export function MenuIcon({
  icon,
  kind,
  className = 'size-4 shrink-0',
}: {
  icon?: string | null
  kind: 'category' | 'entity'
  className?: string
}) {
  const Icon =
    icons.find((item) => item.id === icon)?.Icon ??
    (kind === 'category' ? Folder : Database)
  return <Icon className={className} aria-hidden="true" />
}

export function MenuIconPicker({
  value,
  kind,
  onChange,
}: {
  value: string
  kind: 'category' | 'entity'
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 text-sm font-medium">Icône du menu</legend>
      <Button
        type="button"
        variant={value ? 'outline' : 'secondary'}
        size="sm"
        aria-pressed={!value}
        onClick={() => onChange('')}
      >
        <MenuIcon kind={kind} /> Par défaut
      </Button>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {icons.map(({ id, label, Icon }) => (
          <Button
            key={id}
            type="button"
            variant={value === id ? 'secondary' : 'outline'}
            className="h-16 min-w-0 flex-col gap-1 px-1"
            aria-label={`Icône ${label}`}
            aria-pressed={value === id}
            title={label}
            onClick={() => onChange(id)}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="w-full truncate text-center text-[10px] font-normal">
              {label}
            </span>
          </Button>
        ))}
      </div>
    </fieldset>
  )
}

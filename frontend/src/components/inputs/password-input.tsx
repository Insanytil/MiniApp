import { useState } from 'react'
import type { ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function PasswordInput({
  disabled,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        className={`h-11 bg-background pr-12 ${className ?? ''}`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-1.5 right-1.5 text-muted-foreground"
        disabled={disabled}
        onClick={() => setVisible((value) => !value)}
        aria-label={
          visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
        }
        aria-pressed={visible}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  )
}

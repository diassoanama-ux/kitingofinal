'use client'

import { Camera, Home, Navigation, Package } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Tab = 'inicio' | 'pesquisar' | 'amostra' | 'rastreio' | 'pedidos'

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'inicio', label: 'Catálogo', icon: Home },
  { id: 'amostra', label: 'Match Amostra', icon: Camera },
  { id: 'rastreio', label: 'Rastreio GPS', icon: Navigation },
  { id: 'pedidos', label: 'Meus Pedidos', icon: Package },
]

type BottomNavProps = {
  active: Tab
  onChange: (tab: Tab) => void
  pendingOrders: number
}

export function BottomNav({ active, onChange, pendingOrders }: BottomNavProps) {
  const itemClass =
    'relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = active === id || (id === 'inicio' && active === 'pesquisar')
          return (
            <li key={id} className="flex flex-1">
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(itemClass, isActive ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-primary')}
              >
                {isActive && (
                  <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-accent" />
                )}
                <span className="relative">
                  <Icon className="size-5" aria-hidden="true" />
                  {id === 'pedidos' && pendingOrders > 0 && (
                    <span className="absolute -top-1 -right-2 flex size-4 items-center justify-center rounded-full bg-brand-accent text-[9px] font-bold text-brand-accent-foreground">
                      {pendingOrders}
                    </span>
                  )}
                </span>
                {label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}


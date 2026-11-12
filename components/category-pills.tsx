'use client'

import { Battery, CircleDot, Cog, Droplet, LayoutGrid, Waves } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { categories, type Category } from '@/lib/products'

const icons: Record<Category, LucideIcon> = {
  Todas: LayoutGrid,
  'Peças de Motor': Cog,
  Suspensão: Waves,
  Eletrónica: Battery,
  Pneus: CircleDot,
  'Óleos & Lubrificantes': Droplet,
}

type CategoryPillsProps = {
  active: Category
  onChange: (category: Category) => void
}

export function CategoryPills({ active, onChange }: CategoryPillsProps) {
  return (
    <nav aria-label="Categorias" className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-2 py-1">
        {categories.map((category) => {
          const Icon = icons[category]
          const isActive = category === active
          return (
            <li key={category}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onChange(category)}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary/40',
                )}
              >
                <Icon
                  className={cn('size-4', isActive ? 'text-brand-accent' : 'text-muted-foreground')}
                  aria-hidden="true"
                />
                {category}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

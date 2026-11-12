'use client'

import { Camera, MapPin, Search, ShoppingCart, X } from 'lucide-react'
import type { Ref } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const locations = [
  'Maianga, Luanda',
  'Ingombota, Luanda',
  'Talatona, Luanda',
  'Alvalade, Luanda',
  'Morro Bento, Luanda',
  'Kilamba, Luanda',
  'Viana, Luanda',
]

const searchSuggestions = ['Vela de ignição', 'Amortecedor Toyota', 'Alternador Hilux', 'Filtro de óleo']

type AppHeaderProps = {
  query: string
  onQueryChange: (value: string) => void
  location: string
  onLocationChange: (value: string) => void
  cartCount: number
  onCartClick: () => void
  onMatchAmostraClick?: () => void
  searchRef: Ref<HTMLInputElement>
  customerName?: string
  customerPhone?: string
}

export function AppHeader({
  query,
  onQueryChange,
  location,
  onLocationChange,
  cartCount,
  onCartClick,
  onMatchAmostraClick,
  searchRef,
  customerName,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-primary text-primary-foreground shadow-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-lg font-black text-brand-accent-foreground"
            >
              KT
            </div>
            <div className="leading-tight">
              <p className="text-lg font-bold tracking-tight">
                Kitingo <span className="text-brand-accent">Correios</span>
              </p>
              <p className="text-xs text-primary-foreground/75 text-pretty">
                O Mercado dos Correios no Telemóvel
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onMatchAmostraClick && (
              <button
                type="button"
                onClick={onMatchAmostraClick}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-accent px-3 text-xs font-bold text-brand-accent-foreground shadow-xs transition-transform active:scale-95"
              >
                <Camera className="size-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Match por Amostra</span>
                <span className="sm:hidden">Amostra</span>
              </button>
            )}

            {customerName && (
              <div className="flex items-center gap-2 rounded-xl bg-primary-foreground/10 px-2.5 py-1.5 text-right">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-accent text-xs font-bold text-brand-accent-foreground">
                  {customerName.trim().charAt(0).toUpperCase()}
                </span>
                <div className="hidden leading-tight sm:block">
                  <p className="text-[10px] text-primary-foreground/70">Cliente</p>
                  <p className="max-w-[130px] truncate text-xs font-semibold text-primary-foreground">
                    {customerName}
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onCartClick}
              className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-foreground/10 transition-colors hover:bg-primary-foreground/20 focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:outline-none"
            >
              <ShoppingCart className="size-5" aria-hidden="true" />
              <span className="sr-only">Abrir carrinho ({cartCount} itens)</span>
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-brand-accent text-[11px] font-bold text-brand-accent-foreground">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Select value={location} onValueChange={(value) => value && onLocationChange(value)}>
            <SelectTrigger
              aria-label="Localização de entrega"
              className="h-10 w-full border-primary-foreground/15 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/15 md:w-56 [&_svg]:text-primary-foreground/70"
            >
              <MapPin className="size-4 text-brand-accent" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locations.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <label htmlFor="search-parts" className="sr-only">
              Pesquisar peças auto
            </label>
            <Input
              id="search-parts"
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Vela de ignição, Amortecedor Toyota…"
              className="h-11 rounded-xl border-0 bg-card pr-10 pl-9 text-foreground shadow-sm placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" aria-hidden="true" />
                <span className="sr-only">Limpar pesquisa</span>
              </button>
            )}
          </div>
        </div>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" aria-label="Pesquisas populares">
          {searchSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onQueryChange(s)}
              className="shrink-0 rounded-full border border-primary-foreground/20 px-3 py-1 text-xs text-primary-foreground/85 transition-colors hover:border-brand-accent hover:text-brand-accent"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}

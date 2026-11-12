'use client'

import Image from 'next/image'
import { Check, Plus, ShieldCheck, Star, Store } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatKz, type Product } from '@/lib/products'

type ProductCardProps = {
  product: Product
  quantityInCart: number
  onAdd: (product: Product) => void
}

export function ProductCard({ product, quantityInCart, onAdd }: ProductCardProps) {
  const lowStock = product.inStock <= 5
  const isNew = product.condition === 'nova'
  const partRating = isNew ? '4.9' : '4.8'

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-square bg-muted">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
          className="object-cover"
        />

        {/* Condition Tag: New (Green badge with brand) vs Recondicionada/Ocasião (Amber badge with 72h testing warranty) */}
        <div className="absolute top-2 right-2 left-2 flex flex-wrap items-start justify-between gap-1">
          {isNew ? (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-emerald-500/30 bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-2xs">
              <span>🆕 Nova · {product.brand}</span>
            </span>
          ) : (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-amber-500/40 bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-slate-950 shadow-2xs">
              <span>🔄 Ocasião · Garantia 72h</span>
            </span>
          )}

          {lowStock && (
            <span className="rounded-md bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-2xs">
              Só {product.inStock}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <Badge
            variant="secondary"
            className="block h-auto max-w-full justify-start truncate rounded-md bg-accent px-1.5 py-0.5 text-left text-[11px] text-accent-foreground"
          >
            {product.compatibility}
          </Badge>
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">
            <Star className="size-3 fill-[#F59E0B] text-[#F59E0B]" />
            {partRating} ★
          </span>
        </div>

        <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-balance">{product.name}</h3>

        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <p className="flex items-center gap-1">
            <Store className="size-3 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate font-medium">
              {product.bancaCode} · {product.bancaName}
            </span>
          </p>
          <p
            className={`flex items-center gap-1 font-medium ${
              isNew ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            <ShieldCheck className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {isNew ? `${product.brand} · ${product.warrantyLabel}` : 'Recondicionada · 72h Garantia de Teste'}
            </span>
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-1">
          <p className="text-base font-bold tabular-nums">{formatKz(product.price)}</p>
          <Button
            onClick={() => onAdd(product)}
            className="h-9 w-full rounded-lg bg-brand-accent font-semibold text-brand-accent-foreground hover:bg-brand-accent/90"
          >
            {quantityInCart > 0 ? (
              <>
                <Check className="size-4" aria-hidden="true" />
                No carrinho ({quantityInCart})
              </>
            ) : (
              <>
                <Plus className="size-4" aria-hidden="true" />
                Adicionar
              </>
            )}
          </Button>
        </div>
      </div>
    </article>
  )
}


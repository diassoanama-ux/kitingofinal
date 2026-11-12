'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Check, Copy, CreditCard, Landmark, Minus, Plus, ShieldCheck, Smartphone, Truck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { DELIVERY_FEE, formatKz, type Product } from '@/lib/products'

export type CartLine = { product: Product; quantity: number }

export type OrderItemSummary = {
  productId: string
  name: string
  stall: number
  price: number
  quantity: number
  image: string
}

export type Order = {
  id: string
  entity: string
  reference: string
  amount: number
  itemCount: number
  createdAt: number
  customerName?: string | null
  customerPhone?: string | null
  location?: string | null
  status?: string
  items?: OrderItemSummary[]
}

const EMIS_ENTITY = '10116'

const paymentMethods = [
  {
    id: 'referencia',
    label: 'Referência Multicaixa (EMIS)',
    description: 'Pague no ATM, Multicaixa Express ou internet banking',
    icon: Landmark,
    disabled: false,
  },
  {
    id: 'express',
    label: 'Multicaixa Express',
    description: 'Brevemente disponível',
    icon: Smartphone,
    disabled: true,
  },
  {
    id: 'tpa',
    label: 'TPA na recolha',
    description: 'Indisponível — política Zero Fiado',
    icon: CreditCard,
    disabled: true,
  },
] as const

function generateReference() {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('')
  return digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')
}

type CheckoutDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  lines: CartLine[]
  onQuantityChange: (productId: string, quantity: number) => void
  onOrderCreated: (order: Order) => void
  onStartLiveTracking?: (order: Order) => void
}

export function CheckoutDrawer({
  open,
  onOpenChange,
  lines,
  onQuantityChange,
  onOrderCreated,
  onStartLiveTracking,
}: CheckoutDrawerProps) {
  const [method, setMethod] = useState<string>('referencia')
  const [order, setOrder] = useState<Order | null>(null)
  const [copied, setCopied] = useState(false)

  const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0)
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = subtotal + (itemCount > 0 ? DELIVERY_FEE : 0)

  function handleGenerate() {
    const newOrder: Order = {
      id: `CE-${Date.now().toString().slice(-6)}`,
      entity: EMIS_ENTITY,
      reference: generateReference(),
      amount: total,
      itemCount,
      createdAt: Date.now(),
      status: 'aguarda_pagamento',
      items: lines.map(({ product, quantity }) => ({
        productId: product.id,
        name: product.name,
        stall: product.stall,
        price: product.price,
        quantity,
        image: product.image,
      })),
    }
    setOrder(newOrder)
    onOrderCreated(newOrder)
  }

  async function handleCopy() {
    if (!order) return
    try {
      await navigator.clipboard.writeText(order.reference.replace(/\s/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          setOrder(null)
          setCopied(false)
        }
      }}
    >
      <DrawerContent className="mx-auto max-w-lg rounded-t-3xl bg-background">
        <DrawerHeader className="relative border-b border-border bg-card text-left">
          <DrawerTitle className="text-lg font-bold">
            {order ? 'Referência EMIS Gerada · Escrow Zero Fiado' : 'Finalizar pedido'}
          </DrawerTitle>
          <DrawerDescription>
            {order
              ? `Pedido ${order.id} · Proteção Escrow Kitingo Ativa`
              : 'Recolha na banca ou entrega com rastreio GPS em Luanda'}
          </DrawerDescription>
          <DrawerClose
            render={
              <button
                type="button"
                className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              />
            }
          >
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </DrawerClose>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {order ? (
            <ReferenceBox
              order={order}
              copied={copied}
              onCopy={handleCopy}
              onTrackOrder={() => {
                onOpenChange(false)
                onStartLiveTracking?.(order)
              }}
            />
          ) : lines.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              O seu carrinho está vazio. Adicione peças para continuar.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <section aria-labelledby="summary-heading" className="flex flex-col gap-3">
                <h3 id="summary-heading" className="text-sm font-semibold">
                  Resumo do pedido
                </h3>
                <ul className="flex flex-col gap-2">
                  {lines.map(({ product, quantity }) => (
                    <li key={product.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2">
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                        <Image src={product.image} alt="" fill sizes="56px" className="object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.bancaCode || `Banca #${product.stall}`} ·{' '}
                          {product.condition === 'nova' ? `🆕 ${product.brand}` : '🔄 Ocasião (Garantia 72h)'}
                        </p>
                        <p className="text-sm font-semibold tabular-nums">{formatKz(product.price * quantity)}</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-full border border-border">
                        <button
                          type="button"
                          onClick={() => onQuantityChange(product.id, quantity - 1)}
                          className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
                        >
                          <Minus className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">Diminuir quantidade de {product.name}</span>
                        </button>
                        <span className="w-5 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onQuantityChange(product.id, quantity + 1)}
                          disabled={quantity >= product.inStock}
                          className="flex size-8 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">Aumentar quantidade de {product.name}</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <dl className="flex flex-col gap-1.5 rounded-xl bg-card p-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      Preço dos itens ({itemCount})
                    </dt>
                    <dd className="tabular-nums">{formatKz(subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="flex items-center gap-1 text-muted-foreground">
                      <Truck className="size-3.5" aria-hidden="true" />
                      Taxa de entrega c/ GPS ao vivo
                    </dt>
                    <dd className="tabular-nums">{formatKz(DELIVERY_FEE)}</dd>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-dashed border-border pt-2 text-base font-bold">
                    <dt>Total em Escrow</dt>
                    <dd className="tabular-nums">{formatKz(total)}</dd>
                  </div>
                </dl>
              </section>

              <section aria-labelledby="payment-heading" className="flex flex-col gap-3">
                <h3 id="payment-heading" className="text-sm font-semibold">
                  Método de pagamento
                </h3>
                <RadioGroup value={method} onValueChange={(v) => setMethod(String(v))} aria-labelledby="payment-heading">
                  {paymentMethods.map(({ id, label, description, icon: Icon, disabled }) => (
                    <label
                      key={id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 transition-colors',
                        method === id ? 'border-primary ring-1 ring-primary' : 'border-border',
                        disabled && 'cursor-not-allowed opacity-55',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg',
                          method === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="block text-xs text-muted-foreground">{description}</span>
                      </span>
                      <RadioGroupItem value={id} disabled={disabled} />
                    </label>
                  ))}
                </RadioGroup>
              </section>

              <aside className="flex gap-3 rounded-xl border border-brand-accent/40 bg-accent p-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent-foreground" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-accent-foreground">
                    Proteção Escrow "Zero Fiado" Kitingo
                  </p>
                  <p className="text-xs leading-relaxed text-accent-foreground/90 text-pretty">
                    O valor pago por Referência Multicaixa EMIS fica retido em conta caução (Escrow). O vendedor da
                    banca só recebe a liquidação após a entrega confirmada por GPS e validação da garantia de 72h.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </div>

        <DrawerFooter className="border-t border-border bg-card pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {order ? (
            <DrawerClose
              render={<Button className="h-12 w-full rounded-xl text-base font-semibold" />}
            >
              Concluído
            </DrawerClose>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={lines.length === 0}
              className="h-12 w-full rounded-xl bg-brand-accent text-base font-semibold text-brand-accent-foreground hover:bg-brand-accent/90"
            >
              Gerar Referência · {formatKz(total)}
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function ReferenceBox({
  order,
  copied,
  onCopy,
  onTrackOrder,
}: {
  order: Order
  copied: boolean
  onCopy: () => void
  onTrackOrder?: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border-2 border-primary bg-card shadow-sm">
        <div className="flex items-center justify-between bg-primary px-4 py-2.5 text-primary-foreground">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="size-4 text-brand-accent" aria-hidden="true" />
            Pagamento por Referência
          </span>
          <span className="rounded-md bg-brand-accent px-2 py-0.5 text-[10px] font-bold text-brand-accent-foreground uppercase">
            EMIS · ZERO FIADO
          </span>
        </div>
        <dl className="divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-sm text-muted-foreground">Entidade</dt>
            <dd className="font-mono text-lg font-bold tracking-wider">{order.entity}</dd>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-sm text-muted-foreground">Referência</dt>
            <dd className="font-mono text-lg font-bold tracking-wider">{order.reference}</dd>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-sm text-muted-foreground">Montante</dt>
            <dd className="text-lg font-bold tabular-nums">{formatKz(order.amount)}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 p-3 pt-0">
          <Button
            variant="outline"
            onClick={onCopy}
            className={cn(
              'h-11 w-full rounded-xl font-semibold',
              copied && 'border-success text-success hover:text-success',
            )}
          >
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? 'Referência copiada!' : 'Copiar Referência'}
          </Button>
          {onTrackOrder && (
            <Button
              type="button"
              onClick={onTrackOrder}
              className="h-11 w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
            >
              <Truck className="mr-1.5 size-4" />
              Confirmar Liquidação EMIS & Rastrear Estafeta GPS
            </Button>
          )}
          <span className="sr-only" aria-live="polite">
            {copied ? 'Referência copiada para a área de transferência' : ''}
          </span>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <p className="leading-relaxed">
          <strong>Escrow Kitingo "Zero Fiado":</strong> O seu montante de{' '}
          <span className="font-bold tabular-nums">{formatKz(order.amount)}</span> fica protegido até à entrega na sua
          localização ou recolha na Praça dos Correios.
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground">Referência válida por 48 horas na rede EMIS</p>

      <ol className="flex flex-col gap-2 rounded-xl bg-card p-4 text-sm">
        {[
          'Abra o Multicaixa Express, ATM ou o seu internet banking.',
          'Escolha Pagamentos › Pagamento por Referência.',
          'Introduza a Entidade, a Referência e o Montante acima.',
          'Acompanhe o estafeta em tempo real no Mapa GPS desde a Praça dos Correios.',
        ].map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {i + 1}
            </span>
            <span className="pt-0.5 text-pretty">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}


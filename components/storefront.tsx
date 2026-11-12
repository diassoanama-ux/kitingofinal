'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ChevronRight, SearchX, ShieldCheck, ShoppingCart } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { BottomNav, type Tab } from '@/components/bottom-nav'
import { CategoryPills } from '@/components/category-pills'
import { CheckoutDrawer, type CartLine, type Order } from '@/components/checkout-drawer'
import { LiveGpsTracking } from '@/components/live-gps-tracking'
import { MatchAmostraView } from '@/components/match-amostra-view'
import { OrdersView } from '@/components/orders-view'
import { ProductCard } from '@/components/product-card'
import {
  formatKz,
  products as initialCatalogProducts,
  type Category,
  type ConditionFilter,
  type Product,
} from '@/lib/products'

const ORDERS_STORAGE_KEY = 'kitingo_customer_orders_v1'

const CONDITION_FILTER_PILLS: Array<{ id: ConditionFilter; label: string }> = [
  { id: 'Todos', label: 'Todos' },
  { id: 'nova', label: '🆕 Peças Novas' },
  { id: 'ocasiao', label: '🔄 Ocasião' },
]

type StorefrontProps = {
  customerName?: string
  customerPhone?: string
}

export function Storefront({ customerName, customerPhone }: StorefrontProps = {}) {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('Maianga, Luanda')
  const [category, setCategory] = useState<Category>('Todas')
  const [conditionFilter, setConditionFilter] = useState<ConditionFilter>('Todos')
  const [catalogProducts, setCatalogProducts] = useState<Product[]>(initialCatalogProducts)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('inicio')
  const [trackedOrder, setTrackedOrder] = useState<Order | null>(null)
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const cached = localStorage.getItem(ORDERS_STORAGE_KEY)
      if (!cached) return []
      const parsed = JSON.parse(cached)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    async function loadOrders() {
      try {
        const params = customerPhone
          ? `?phone=${encodeURIComponent(customerPhone)}`
          : ''
        const res = await fetch(`/api/orders${params}`)
        if (!res.ok) return
        const data = await res.json()
        if (active && Array.isArray(data?.orders)) {
          setOrders((prev) => {
            const byId: Record<string, Order> = {}
            for (const o of data.orders as Order[]) {
              byId[o.id] = o
            }
            for (const localOrder of prev) {
              if (!byId[localOrder.id]) {
                byId[localOrder.id] = localOrder
              }
            }
            const merged = Object.values(byId).sort(
              (a, b) => b.createdAt - a.createdAt,
            )
            try {
              localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(merged))
            } catch {
              // ignore storage errors
            }
            return merged
          })
        }
      } catch {
        // Fallback to cached localStorage orders if offline
      }
    }
    loadOrders()
    return () => {
      active = false
    }
  }, [customerPhone])

  const filtered = useMemo(() => {
    const words = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .split(/\s+/)
      .filter(Boolean)
    return catalogProducts.filter((p) => {
      if (conditionFilter !== 'Todos' && p.condition !== conditionFilter) return false
      if (category !== 'Todas' && p.category !== category) return false
      if (words.length === 0) return true
      const haystack = `${p.name} ${p.compatibility} ${p.category} ${p.brand} ${p.bancaCode} ${p.bancaName}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
      return words.some((w) => haystack.includes(w))
    })
  }, [query, category, conditionFilter, catalogProducts])

  const lines: CartLine[] = catalogProducts
    .filter((p) => cart[p.id])
    .map((product) => ({ product, quantity: cart[product.id] }))
  const cartCount = lines.reduce((sum, l) => sum + l.quantity, 0)
  const cartTotal = lines.reduce((sum, l) => sum + l.quantity * l.product.price, 0)

  function addToCart(product: Product) {
    setCatalogProducts((prev) =>
      prev.some((p) => p.id === product.id) ? prev : [product, ...prev],
    )
    setCart((prev) => ({
      ...prev,
      [product.id]: Math.min((prev[product.id] ?? 0) + 1, product.inStock),
    }))
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((prev) => {
      const next = { ...prev }
      if (quantity <= 0) delete next[productId]
      else next[productId] = quantity
      return next
    })
  }

  function handleOrderCreated(order: Order) {
    const enrichedOrder: Order = {
      ...order,
      customerName: customerName ?? null,
      customerPhone: customerPhone ?? null,
      location,
    }
    setTrackedOrder(enrichedOrder)
    setOrders((prev) => {
      const next = [enrichedOrder, ...prev.filter((o) => o.id !== enrichedOrder.id)]
      try {
        localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
    setCart({})

    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enrichedOrder),
    }).catch((err) => {
      console.error('Failed to persist customer order:', err)
    })
  }

  function handleStartLiveTracking(order: Order) {
    const updatedOrder: Order = { ...order, status: 'em_transito' }
    setTrackedOrder(updatedOrder)
    setOrders((prev) => {
      const next = prev.map((o) => (o.id === order.id ? updatedOrder : o))
      try {
        localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
    fetch(`/api/orders/${encodeURIComponent(order.id)}/confirm-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location }),
    }).catch(() => {})
    setTab('rastreio')
  }

  function handleTabChange(next: Tab) {
    setTab(next)
    if (next === 'pesquisar') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      searchRef.current?.focus()
    }
  }

  return (
    <div className="min-h-dvh pb-36">
      <AppHeader
        query={query}
        onQueryChange={(value) => {
          setQuery(value)
          if (tab !== 'inicio' && tab !== 'pesquisar') setTab('inicio')
        }}
        location={location}
        onLocationChange={setLocation}
        cartCount={cartCount}
        onCartClick={() => setCheckoutOpen(true)}
        onMatchAmostraClick={() => setTab('amostra')}
        searchRef={searchRef}
        customerName={customerName}
        customerPhone={customerPhone}
      />

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-4">
        {tab === 'pedidos' ? (
          <section aria-labelledby="orders-heading" className="flex flex-col gap-3">
            <h1 id="orders-heading" className="text-xl font-bold">
              Meus Pedidos ({orders.length})
            </h1>
            <OrdersView
              orders={orders}
              onTrackOrder={(order) => handleStartLiveTracking(order)}
            />
          </section>
        ) : tab === 'amostra' ? (
          <MatchAmostraView
            customerName={customerName}
            customerPhone={customerPhone}
            onAddMatchedProduct={(product) => addToCart(product)}
            onOpenCart={() => setCheckoutOpen(true)}
          />
        ) : tab === 'rastreio' ? (
          <section aria-labelledby="tracking-heading" className="flex flex-col gap-3">
            <h1 id="tracking-heading" className="text-xl font-bold">
              Rastreio GPS em Tempo Real · Praça dos Correios
            </h1>
            <LiveGpsTracking
              activeOrder={trackedOrder || orders[0] || null}
              customerName={customerName}
              customerPhone={customerPhone}
              locationLabel={location}
              onLocationUpdated={(newLoc) => setLocation(newLoc)}
            />
          </section>
        ) : (
          <>
            {/* Zero Fiado Escrow + Match por Amostra Quick Banner */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex items-center gap-3 rounded-2xl bg-primary/5 p-3.5 ring-1 ring-primary/10">
                <ShieldCheck className="size-8 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-xs leading-relaxed text-pretty">
                  <span className="font-bold">Escrow Zero Fiado EMIS:</span> pague por Referência Multicaixa com
                  proteção caução e acompanhe o estafeta por GPS até {location.split(',')[0]}.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-accent/40 bg-card p-3.5 shadow-2xs">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">
                    Não sabe a referência da peça antiga?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tire 2 a 3 fotos e envie para a fila das bancas da Praça dos Correios.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('amostra')}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-accent px-3.5 py-2 text-xs font-bold text-brand-accent-foreground hover:bg-brand-accent/90"
                >
                  <Camera className="size-4" />
                  Match por Amostra
                </button>
              </div>
            </div>

            {/* Condition Filter Pills: [Todos] | [🆕 Peças Novas] | [🔄 Ocasião] */}
            <div className="flex flex-col gap-2.5">
              <div
                role="group"
                aria-label="Filtrar por estado da peça"
                className="flex flex-wrap items-center gap-2"
              >
                {CONDITION_FILTER_PILLS.map((pill) => {
                  const isSelected = conditionFilter === pill.id
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setConditionFilter(pill.id)}
                      aria-pressed={isSelected}
                      className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-4 text-xs font-bold transition-colors ${
                        isSelected
                          ? pill.id === 'nova'
                            ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                            : pill.id === 'ocasiao'
                              ? 'border-amber-500 bg-amber-500 text-slate-950 shadow-xs'
                              : 'border-primary bg-primary text-primary-foreground shadow-xs'
                          : 'border-border bg-card text-foreground hover:border-primary/40'
                      }`}
                    >
                      <span>{pill.label}</span>
                    </button>
                  )
                })}
              </div>

              <CategoryPills active={category} onChange={setCategory} />
            </div>

            <section aria-labelledby="products-heading" className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <h1 id="products-heading" className="text-lg font-bold">
                  {query
                    ? `Resultados para “${query}”`
                    : conditionFilter === 'nova'
                      ? '🆕 Peças Novas Originais c/ Marca'
                      : conditionFilter === 'ocasiao'
                        ? '🔄 Peças Recondicionadas / Ocasião (Garantia 72h)'
                        : category === 'Todas'
                          ? 'Catálogo da Praça dos Correios'
                          : category}
                </h1>
                <span className="text-xs text-muted-foreground">
                  {filtered.length} {filtered.length === 1 ? 'peça' : 'peças'}
                </span>
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
                  <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
                  <p className="font-semibold">Nenhuma peça encontrada</p>
                  <p className="text-sm text-muted-foreground">
                    Tente outro filtro ou use o Match por Amostra com foto da peça.
                  </p>
                </div>
              ) : (
                <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {filtered.map((product) => (
                    <li key={product.id} className="flex">
                      <ProductCard
                        product={product}
                        quantityInCart={cart[product.id] ?? 0}
                        onAdd={addToCart}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      {cartCount > 0 && !checkoutOpen && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-4 pb-2">
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            className="mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-lg transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:outline-none"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-accent text-brand-accent-foreground">
              <ShoppingCart className="size-4" aria-hidden="true" />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-xs text-primary-foreground/70">
                {cartCount} {cartCount === 1 ? 'item' : 'itens'} no carrinho
              </span>
              <span className="block font-bold tabular-nums">{formatKz(cartTotal)}</span>
            </span>
            <span className="flex items-center gap-1 text-sm font-semibold">
              Finalizar EMIS
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          </button>
        </div>
      )}

      <BottomNav active={tab} onChange={handleTabChange} pendingOrders={orders.length} />

      <CheckoutDrawer
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        lines={lines}
        onQuantityChange={updateQuantity}
        onOrderCreated={handleOrderCreated}
        onStartLiveTracking={handleStartLiveTracking}
      />
    </div>
  )
}


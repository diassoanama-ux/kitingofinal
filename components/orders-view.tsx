import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Clock,
  Headphones,
  Navigation,
  Package,
  PackageCheck,
  ShieldCheck,
  Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatKz } from '@/lib/products'
import type { Order } from '@/components/checkout-drawer'
import { KitingoTicketCenter } from '../src/components/support/kitingo-ticket-center'
import { KitingoDeliveryRatingCenter } from '../src/components/reviews/kitingo-delivery-rating-center'

export function OrdersView({
  orders,
  onTrackOrder,
  customerName = 'João Manuel Baptista',
  customerPhone = '+244 924 514 042',
}: {
  orders: Order[]
  onTrackOrder?: (order: Order) => void
  customerName?: string
  customerPhone?: string
}) {
  const [ticketOrderCode, setTicketOrderCode] = useState<string>(
    orders[0]?.id || 'CE-650018'
  )
  const [deliveredOrderCodes, setDeliveredOrderCodes] = useState<Record<string, boolean>>({})
  const [confirmingOrderCode, setConfirmingOrderCode] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.type === 'delivery:completed' && msg.orderCode) {
          setDeliveredOrderCodes((prev) => ({ ...prev, [msg.orderCode]: true }))
        } else if (
          msg.type === 'gps:mission_updated' &&
          msg.mission?.missionState === 'DELIVERY_CONFIRMED' &&
          msg.mission?.orderCode
        ) {
          setDeliveredOrderCodes((prev) => ({
            ...prev,
            [msg.mission.orderCode]: true,
          }))
        }
      } catch {
        // ignore
      }
    }
    return () => ws.close()
  }, [])

  const handleDirectConfirmOrderReception = async (order: Order) => {
    setConfirmingOrderCode(order.id)
    try {
      const firstPartName =
        order.items?.[0]?.name || 'Alternador Denso 12V 90A (Toyota Hilux / Prado)'
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}/confirm-reception`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorRole: 'cliente',
          customerName,
          partName: firstPartName,
        }),
      })
      if (res.ok) {
        setDeliveredOrderCodes((prev) => ({ ...prev, [order.id]: true }))
        setTicketOrderCode(order.id)
      }
    } catch {
      // ignore
    } finally {
      setConfirmingOrderCode(null)
    }
  }

  const activeOrderForRating =
    orders.find((o) => o.id === ticketOrderCode) || orders[0] || null
  const activePartName =
    activeOrderForRating?.items?.[0]?.name ||
    'Alternador Denso 12V 90A (Toyota Hilux / Prado)'

  return (
    <div className="space-y-6">
      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Package className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold">Ainda não tem pedidos</p>
          <p className="max-w-xs text-sm text-muted-foreground text-pretty">
            Quando gerar uma Referência Multicaixa, o seu pedido aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => {
            const isDelivered =
              order.status === 'entregue_cliente' ||
              order.status === 'entregue' ||
              Boolean(deliveredOrderCodes[order.id])
            const isTransit = !isDelivered && order.status === 'em_transito'
            return (
              <li
                key={order.id}
                className={`flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm ${
                  isDelivered ? 'border-[#16A34A]' : 'border-border'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">Pedido {order.id}</p>
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="size-3" />
                      {isDelivered ? 'Escrow Libertado à Banca' : 'Escrow Zero Fiado'}
                    </span>
                  </div>
                  {isDelivered ? (
                    <span className="flex items-center gap-1.5 rounded-md bg-[#16A34A] px-2.5 py-1 text-xs font-bold text-white shadow-xs">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      Peça Entregue com Sucesso
                    </span>
                  ) : isTransit ? (
                    <span className="flex items-center gap-1 rounded-md bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      <Navigation className="size-3" aria-hidden="true" />
                      Estafeta em Trânsito (GPS)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                      <Clock className="size-3" aria-hidden="true" />
                      Aguarda pagamento EMIS
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-3 gap-2 rounded-xl bg-muted p-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Entidade</dt>
                    <dd className="font-mono text-sm font-bold">{order.entity}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Referência</dt>
                    <dd className="font-mono text-sm font-bold">{order.reference}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Montante</dt>
                    <dd className="text-sm font-bold tabular-nums">{formatKz(order.amount)}</dd>
                  </div>
                </dl>
                {order.items && order.items.length > 0 && (
                  <ul className="flex flex-col gap-1 border-t border-border pt-2 text-xs">
                    {order.items.map((item) => (
                      <li
                        key={item.productId}
                        className="flex items-center justify-between text-muted-foreground"
                      >
                        <span className="truncate pr-2">
                          {item.quantity}x {item.name}{' '}
                          <span className="text-[11px]">(Banca #{item.stall})</span>
                        </span>
                        <span className="shrink-0 font-medium text-foreground tabular-nums">
                          {formatKz(item.price * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <p className="text-xs text-muted-foreground">
                    {order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'} · Saída: Praça dos
                    Correios → {order.location || 'Luanda'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {!isDelivered ? (
                      <Button
                        type="button"
                        disabled={confirmingOrderCode === order.id}
                        onClick={() => handleDirectConfirmOrderReception(order)}
                        className="h-9 rounded-xl bg-[#16A34A] px-3 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
                      >
                        <PackageCheck className="mr-1.5 size-3.5" />
                        {confirmingOrderCode === order.id
                          ? 'A Confirmar...'
                          : 'Confirmar Receção da Peça'}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setTicketOrderCode(order.id)}
                        className="h-9 rounded-xl border-[#F59E0B] text-xs font-bold text-foreground"
                      >
                        <Star className="mr-1.5 size-3.5 fill-[#F59E0B] text-[#F59E0B]" />
                        Avaliar Estafeta e Peça
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setTicketOrderCode(order.id)}
                      className="h-9 rounded-xl text-xs font-semibold"
                    >
                      <Headphones className="mr-1.5 size-3.5 text-[#D97706]" />
                      Abrir Ticket Back-Office
                    </Button>
                    {onTrackOrder && (
                      <Button
                        type="button"
                        onClick={() => onTrackOrder(order)}
                        className="h-9 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"
                      >
                        <Navigation className="mr-1.5 size-3.5" />
                        Rastrear Entrega no Mapa GPS
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Receção da Peça & Avaliação de Estafetas e Peças nas Bancas */}
      <KitingoDeliveryRatingCenter
        mode="customer"
        orderCode={ticketOrderCode}
        customerName={customerName}
        customerPhone={customerPhone}
        partName={activePartName}
        isDeliveredInitial={Boolean(deliveredOrderCodes[ticketOrderCode])}
        onReceptionConfirmed={(summary) =>
          setDeliveredOrderCodes((prev) => ({ ...prev, [summary.orderCode]: true }))
        }
      />

      {/* Central de Tickets do Comprador -> Back-Office */}
      <KitingoTicketCenter
        role="cliente"
        reporterName={customerName}
        reporterPhone={customerPhone}
        defaultOrderCode={ticketOrderCode}
        defaultCustomerName={customerName}
        defaultCustomerPhone={customerPhone}
      />
    </div>
  )
}



'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps'
import {
  Bell,
  Bike,
  CheckCircle2,
  Clock,
  Compass,
  History,
  KeyRound,
  LocateFixed,
  Lock,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Navigation,
  Phone,
  PhoneCall,
  PhoneOff,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Store,
  Volume2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Order } from '@/components/checkout-drawer'
import { formatKz } from '@/lib/products'
import {
  getSimulatedVoiceReply,
  kitingoCallAudio,
} from '../src/lib/kitingo-call-audio.ts'
import { KitingoTicketCenter } from '../src/components/support/kitingo-ticket-center.tsx'
import { KitingoDeliveryRatingCenter } from '../src/components/reviews/kitingo-delivery-rating-center.tsx'
import {
  DELIVERY_STATE_META,
  DELIVERY_STATE_PIPELINE,
  triggerKitingoPushNotification,
  type DeliveryMissionDto,
  type KitingoDeliveryState,
} from '../src/lib/kitingo-gps.ts'
import { KitingoModularNavigation } from '../src/components/logistics/kitingo-modular-navigation'

export type LatLngPoint = {
  lat: number
  lng: number
}

export type LiveTrackingState = {
  orderId: string
  origin: LatLngPoint & { label: string }
  destination: LatLngPoint & { label: string }
  driverPosition: LatLngPoint
  waypoints: LatLngPoint[]
  progressIndex: number
  progressPercent: number
  etaSeconds: number
  distanceKm: number
  currentStreet: string
  driverName: string
  driverPhone: string
  vehicleInfo: string
  status: 'em_transito' | 'chegada_iminente' | 'entregue'
  updatedAt: number
}

export const LUANDA_DELIVERY_PRESETS: Array<{
  label: string
  lat: number
  lng: number
  zone: string
}> = [
  {
    label: 'Maianga · Largo da Maianga (Av. Revolução de Outubro)',
    lat: -8.8295,
    lng: 13.2348,
    zone: 'Maianga, Luanda',
  },
  {
    label: 'Alvalade · Rua Comandante Gika',
    lat: -8.8364,
    lng: 13.2442,
    zone: 'Alvalade, Luanda',
  },
  {
    label: 'Maculusso · Largo Che Guevara',
    lat: -8.8211,
    lng: 13.2412,
    zone: 'Ingombota, Luanda',
  },
  {
    label: 'Vila Alice · Rua Aníbal de Melo',
    lat: -8.8268,
    lng: 13.2535,
    zone: 'Rangel, Luanda',
  },
  {
    label: 'Morro Bento · Rotunda da Gamek',
    lat: -8.8872,
    lng: 13.2265,
    zone: 'Morro Bento, Luanda',
  },
  {
    label: 'Talatona · Avenida Samora Machel',
    lat: -8.9185,
    lng: 13.1845,
    zone: 'Talatona, Luanda',
  },
]

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

type MapPolylineInstance = {
  setMap: (map: unknown) => void
  setOptions: (opts: Record<string, unknown>) => void
}

function DeliveryRouteLayer({
  origin,
  destination,
  waypoints,
  breadcrumbs,
}: {
  origin: LatLngPoint
  destination: LatLngPoint
  waypoints: LatLngPoint[]
  breadcrumbs?: Array<{ lat: number; lng: number }>
}) {
  const map = useMap()
  const routesLib = useMapsLibrary('routes')
  const mapsLib = useMapsLibrary('maps')
  const polylinesRef = useRef<MapPolylineInstance[]>([])

  useEffect(() => {
    if (!map || !mapsLib) return

    polylinesRef.current.forEach((p) => p.setMap(null))
    polylinesRef.current = []

    let cancelled = false

    if (breadcrumbs && breadcrumbs.length >= 2) {
      const trail = new mapsLib.Polyline({
        path: breadcrumbs.map((b) => ({ lat: b.lat, lng: b.lng })),
        geodesic: true,
        strokeColor: '#7C3AED',
        strokeOpacity: 0.7,
        strokeWeight: 3,
      })
      trail.setMap(map)
      polylinesRef.current.push(trail)
    }

    const drawFallbackCorridor = () => {
      if (cancelled || !map || !mapsLib) return
      const path = waypoints && waypoints.length > 1 ? waypoints : [origin, destination]
      const poly = new mapsLib.Polyline({
        path,
        geodesic: true,
        strokeColor: '#16A34A',
        strokeOpacity: 0.9,
        strokeWeight: 5,
      })
      poly.setMap(map)
      polylinesRef.current.push(poly)
    }

    if (routesLib && (routesLib as any).Route?.computeRoutes) {
      const request = {
        origin,
        destination,
        travelMode: 'DRIVING',
        fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
      }

      ;(routesLib as any).Route.computeRoutes(request)
        .then(({ routes }: { routes: any[] }) => {
          if (cancelled) return
          if (routes && routes.length > 0 && typeof routes[0].createPolylines === 'function') {
            const created: MapPolylineInstance[] = routes[0].createPolylines()
            created.forEach((p: MapPolylineInstance) => {
              p.setOptions({
                strokeColor: '#16A34A',
                strokeOpacity: 0.92,
                strokeWeight: 5,
              })
              p.setMap(map)
            })
            polylinesRef.current.push(...created)
            if (routes[0].viewport) {
              map.fitBounds(routes[0].viewport, 48)
            }
          } else {
            drawFallbackCorridor()
          }
        })
        .catch((err: any) => {
          const msg = String(err?.message || err || '')
          if (
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('OVER_QUERY_LIMIT') ||
            msg.includes('429')
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'))
          }
          drawFallbackCorridor()
        })
    } else {
      drawFallbackCorridor()
    }

    return () => {
      cancelled = true
      polylinesRef.current.forEach((p) => p.setMap(null))
      polylinesRef.current = []
    }
  }, [
    map,
    routesLib,
    mapsLib,
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
    waypoints,
    breadcrumbs,
  ])

  return null
}

type LiveGpsTrackingProps = {
  activeOrder?: Order | null
  customerName?: string
  customerPhone?: string
  locationLabel?: string
  onLocationUpdated?: (newLocationLabel: string) => void
}

export function LiveGpsTracking({
  activeOrder,
  customerName,
  customerPhone,
  locationLabel,
  onLocationUpdated,
}: LiveGpsTrackingProps) {
  const [apiKey, setApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '',
  )
  const [tracking, setTracking] = useState<LiveTrackingState | null>(null)
  const [mission, setMission] = useState<DeliveryMissionDto | null>(null)
  const [editingLocation, setEditingLocation] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [customAddress, setCustomAddress] = useState('')
  const [customLat, setCustomLat] = useState('-8.8295')
  const [customLng, setCustomLng] = useState('13.2348')
  const [updatingDestination, setUpdatingDestination] = useState(false)
  const [statusToast, setStatusToast] = useState<string | null>(null)
  const [pushAlert, setPushAlert] = useState<{ title: string; body: string } | null>(null)
  const [wsConnected, setWsConnected] = useState(false)

  // Interactive Voice Call State for Customer (Exclusivamente Ligar ao Estafeta — Contacto da Banca protegido)
  const [customerCall, setCustomerCall] = useState<{
    target: 'ESTAFETA'
    name: string
    phone: string
    subtitle: string
  } | null>(null)
  const [callPhase, setCallPhase] = useState<'ringing' | 'connected'>('connected')
  const [callSeconds, setCallSeconds] = useState(0)
  const [callMuted, setCallMuted] = useState(false)
  const [callSpeaker, setCallSpeaker] = useState(true)
  const [callQuickNote, setCallQuickNote] = useState<string | null>(null)
  const [callReply, setCallReply] = useState<string | null>(null)

  useEffect(() => {
    if (!customerCall) {
      setCallSeconds(0)
      return
    }
    const timer = setInterval(() => {
      setCallSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [customerCall])

  const handleCustomerStartCall = () => {
    const name = `${mission?.driverName || tracking?.driverPhone ? mission?.driverName || tracking?.driverName || 'Paulo Sebastião' : 'Paulo Sebastião'} (${mission?.driverCode || 'EST-019'})`
    const phone = mission?.driverPhone || tracking?.driverPhone || '+244 931 880 210'
    const subtitle = `Estafeta em Rota · Matrícula ${mission?.vehiclePlate || 'LD-44-92-AO'}`

    setCallQuickNote(null)
    setCallReply(null)
    setCallSeconds(0)
    setCallMuted(false)
    setCallSpeaker(true)
    setCallPhase('ringing')
    setCustomerCall({ target: 'ESTAFETA', name, phone, subtitle })

    kitingoCallAudio.playDialAndConnectSound(() => {
      setCallPhase('connected')
      setCallReply(getSimulatedVoiceReply('ESTAFETA'))
    })
  }

  const handleCustomerEndCall = () => {
    kitingoCallAudio.playHangupTone()
    setCustomerCall(null)
    setCallQuickNote(null)
    setCallReply(null)
  }

  const formatCallTime = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
  }

  useEffect(() => {
    if (apiKey) return
    fetch('/api/config/maps')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.apiKey) setApiKey(data.apiKey)
      })
      .catch(() => {})
  }, [apiKey])

  const loadCustomerMission = useCallback(async () => {
    try {
      const phoneQuery = customerPhone
        ? `&customerPhone=${encodeURIComponent(customerPhone)}`
        : ''
      const res = await fetch(`/api/gps/missions?role=cliente${phoneQuery}`)
      if (!res.ok) return
      const data = await res.json()
      if (data?.ok && Array.isArray(data.missions) && data.missions.length > 0) {
        const matched =
          (activeOrder?.id &&
            data.missions.find((m: DeliveryMissionDto) => m.orderCode === activeOrder.id)) ||
          data.missions[0]
        setMission(matched)
      }
    } catch {
      // ignore
    }
  }, [customerPhone, activeOrder?.id])

  // Load initial tracking state & subscribe via WebSocket (/ws)
  useEffect(() => {
    let mounted = true
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    fetch('/api/tracking/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (mounted && data?.tracking) {
          setTracking(data.tracking)
          setCustomAddress(data.tracking.destination.label)
          setCustomLat(String(data.tracking.destination.lat))
          setCustomLng(String(data.tracking.destination.lng))
        }
      })
      .catch(() => {})

    loadCustomerMission()

    function connectWebSocket() {
      if (!mounted) return
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`
      try {
        ws = new WebSocket(wsUrl)
        ws.onopen = () => {
          if (mounted) setWsConnected(true)
        }
        ws.onmessage = (event) => {
          if (!mounted) return
          try {
            const payload = JSON.parse(event.data)
            if (
              payload?.type === 'tracking:init' ||
              payload?.type === 'tracking:tick' ||
              payload?.type === 'tracking:destination_updated'
            ) {
              setTracking(payload.tracking)
            } else if (payload?.type === 'gps:mission_updated' && payload.mission) {
              setMission((prev) => {
                // Enforce customer isolation in real-time stream
                if (
                  prev &&
                  payload.mission.orderCode !== prev.orderCode &&
                  customerPhone &&
                  payload.mission.customerPhone !== customerPhone
                ) {
                  return prev
                }
                return payload.mission
              })
              if (payload.pushNotification) {
                setPushAlert({
                  title: payload.pushNotification.title,
                  body: payload.pushNotification.body,
                })
                triggerKitingoPushNotification(
                  payload.pushNotification.title,
                  payload.pushNotification.body,
                )
              }
            } else if (payload?.type === 'delivery:completed') {
              setMission((prev) =>
                prev
                  ? {
                      ...prev,
                      missionState: 'DELIVERY_CONFIRMED',
                      etaSeconds: 0,
                      distanceKm: 0,
                    }
                  : prev,
              )
              setPushAlert({
                title: `Peça Entregue com Sucesso (${payload.orderCode || 'CE-650018'})!`,
                body: `Receção confirmada. Pode agora avaliar o estafeta ${payload.driverName || 'Paulo Sebastião'} e a peça da ${payload.bancaName || 'Banca #08'}.`,
              })
            }
          } catch {
            // ignore malformed message
          }
        }
        ws.onclose = () => {
          if (!mounted) return
          setWsConnected(false)
          reconnectTimer = setTimeout(connectWebSocket, 3000)
        }
      } catch {
        setWsConnected(false)
      }
    }

    connectWebSocket()

    return () => {
      mounted = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) ws.close()
    }
  }, [loadCustomerMission, customerPhone])

  const applyNewDestination = useCallback(
    async (lat: number, lng: number, label: string) => {
      setUpdatingDestination(true)
      setStatusToast(null)
      try {
        const res = await fetch('/api/tracking/update-destination', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat,
            lng,
            label,
            orderId: mission?.orderCode || activeOrder?.id || tracking?.orderId || 'CE-650018',
          }),
        })
        const data = await res.json()
        if (res.ok && data?.tracking) {
          setTracking(data.tracking)
          setCustomAddress(data.tracking.destination.label)
          setCustomLat(String(data.tracking.destination.lat))
          setCustomLng(String(data.tracking.destination.lng))
          setEditingLocation(false)
          setStatusToast(`Local de entrega atualizado para: ${label}`)
          onLocationUpdated?.(label)
          setTimeout(() => setStatusToast(null), 4000)
        }
      } catch {
        setStatusToast('Não foi possível atualizar o ponto de entrega.')
      } finally {
        setUpdatingDestination(false)
      }
    },
    [activeOrder?.id, mission?.orderCode, onLocationUpdated, tracking?.orderId],
  )

  function handleUseDeviceGps() {
    if (!navigator.geolocation) {
      setStatusToast('Geolocalização não suportada neste navegador.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5))
        const lng = Number(pos.coords.longitude.toFixed(5))
        setCustomLat(String(lat))
        setCustomLng(String(lng))
        applyNewDestination(lat, lng, `Coordenadas GPS Cliente (${lat}, ${lng})`)
      },
      () => {
        applyNewDestination(
          -8.8295,
          13.2348,
          'Maianga · Ponto GPS Atualizado, Luanda',
        )
      },
      { enableHighAccuracy: true, timeout: 5000 },
    )
  }

  function handleCustomFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedLat = parseFloat(customLat)
    const parsedLng = parseFloat(customLng)
    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) return
    const label =
      customAddress.trim() || `Ponto Personalizado (${parsedLat.toFixed(4)}, ${parsedLng.toFixed(4)})`
    applyNewDestination(parsedLat, parsedLng, label)
  }

  const activeMissionState: KitingoDeliveryState =
    mission?.missionState || 'GOING_TO_DESTINATION'
  const stateMeta =
    DELIVERY_STATE_META[activeMissionState] || DELIVERY_STATE_META.GOING_TO_DESTINATION

  const origin = mission
    ? {
        lat: mission.pickupLat,
        lng: mission.pickupLng,
        label: `${mission.bancaCode} · ${mission.bancaName} (${mission.pickupAddress})`,
      }
    : tracking?.origin || {
        lat: -8.8147,
        lng: 13.2302,
        label: 'Praça dos Correios · Ingombota, Luanda',
      }

  const destination = mission
    ? {
        lat: mission.destinationLat,
        lng: mission.destinationLng,
        label: mission.destinationAddress,
      }
    : tracking?.destination || {
        lat: -8.8295,
        lng: 13.2348,
        label: locationLabel || 'Maianga · Largo da Maianga, Luanda',
      }

  const driverPos = mission
    ? {
        lat: mission.driverLat,
        lng: mission.driverLng,
      }
    : tracking?.driverPosition || {
        lat: -8.8211,
        lng: 13.2325,
      }

  const activeRouteTarget =
    mission?.activeLeg === 'PICKUP'
      ? { lat: origin.lat, lng: origin.lng }
      : { lat: destination.lat, lng: destination.lng }

  return (
    <div className="flex flex-col gap-4">
      {/* Real-Time Push Notification Banner */}
      {pushAlert && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl bg-[#7C3AED] px-4 py-3 text-xs font-bold text-white shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <Bell className="size-4 shrink-0" />
            <div>
              <p className="font-extrabold">{pushAlert.title}</p>
              <p className="font-normal opacity-95">{pushAlert.body}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPushAlert(null)}
            className="rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/30"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Live ETA Countdown Card + Atualizar Local de Entrega Button */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-accent text-brand-accent-foreground">
              <Navigation className="size-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold">
                  Pedido {mission?.orderCode || tracking?.orderId || activeOrder?.id || 'CE-650018'}
                </p>
                <span
                  className="rounded-md px-2 py-0.5 font-mono text-[10px] font-black text-white"
                  style={{ backgroundColor: stateMeta.colorHex }}
                >
                  {activeMissionState}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  {wsConnected ? 'GPS AO VIVO' : 'SINCRONIZADO'}
                </span>
              </div>
              <p className="text-xs text-primary-foreground/80">
                {stateMeta.customerTitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleCustomerStartCall}
              className="h-10 rounded-xl bg-[#16A34A] px-3.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
            >
              <PhoneCall className="mr-1.5 size-4" />
              Ligar ao Estafeta
            </Button>

            <Button
              type="button"
              onClick={() => setShowQrModal((prev) => !prev)}
              className="h-10 rounded-xl bg-[#7C3AED] px-3.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
            >
              <QrCode className="mr-1.5 size-4" />
              Meu PIN / QR de Receção
            </Button>

            <Button
              type="button"
              onClick={() => setEditingLocation((prev) => !prev)}
              className="h-10 rounded-xl bg-brand-accent px-3.5 text-xs font-bold text-brand-accent-foreground hover:bg-brand-accent/90 cursor-pointer"
            >
              <MapPin className="mr-1.5 size-4" />
              Atualizar Local de Entrega
            </Button>
          </div>
        </div>

        {/* 8-Step Customer Operational Progress Bar */}
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-foreground">
              Etapa da Entrega:{' '}
              <span className="text-primary">
                {mission?.activeLeg === 'PICKUP'
                  ? `1. Estafeta a recolher na ${mission.bancaName}`
                  : `2. Estafeta em rota para o seu endereço (${destination.label})`}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Lock className="size-3 text-[#16A34A]" />
              Sessão Isolada: {mission?.trackingToken || 'TRK-CE650018-AO'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
            {DELIVERY_STATE_PIPELINE.map((st) => {
              const meta = DELIVERY_STATE_META[st]
              const isCurrent = activeMissionState === st
              const isPassed = meta.stepNumber < stateMeta.stepNumber
              return (
                <div
                  key={st}
                  className={`rounded-lg border px-2 py-1.5 text-center ${
                    isCurrent
                      ? 'border-primary bg-primary text-primary-foreground font-bold'
                      : isPassed
                        ? 'border-[#16A34A]/40 bg-[#16A34A]/10 text-foreground font-semibold'
                        : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  <span className="block font-mono text-[9px] opacity-80">
                    Passo {meta.stepNumber}
                  </span>
                  <span className="block truncate text-[10px]">{meta.shortLabel}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Digital Handover PIN & QR Code Drawer for Buyer */}
        {showQrModal && (
          <div className="border-b border-border bg-[#16A34A]/10 p-4">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3.5">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border-2 border-[#16A34A] bg-card shadow-xs">
                  <QrCode className="size-10 text-[#16A34A]" />
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold uppercase text-[#16A34A]">
                    <KeyRound className="size-3.5" />
                    Validação Segura de Entrega ao Comprador
                  </span>
                  <h3 className="text-sm font-bold text-foreground">
                    Apresente este PIN ou QR Code ao Estafeta na Chegada
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    O pagamento em caução (Escrow EMIS) só é libertado após esta confirmação.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-border bg-card px-4 py-2 text-center">
                  <span className="block text-[10px] font-bold uppercase text-muted-foreground">
                    PIN de 4 Dígitos
                  </span>
                  <span className="font-mono text-2xl font-black tracking-widest text-foreground">
                    {mission?.deliveryPin || '2437'}
                  </span>
                </div>

                <div className="rounded-xl border border-border bg-card px-3.5 py-2 text-center">
                  <span className="block text-[10px] font-bold uppercase text-muted-foreground">
                    QR Code Digital
                  </span>
                  <span className="font-mono text-xs font-bold text-[#7C3AED]">
                    {mission?.deliveryQrToken || 'KT-DELIV-CE-650018-2437'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Countdown & Telemetry Metrics Row */}
        <div className="grid grid-cols-2 gap-3 border-b border-border p-4 sm:grid-cols-4">
          <div className="rounded-xl bg-muted/60 p-3">
            <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Clock className="size-3.5 text-primary" />
              ETA Estimado (Ao Vivo)
            </p>
            <p className="mt-1 font-mono text-2xl font-black tracking-tight text-foreground tabular-nums">
              {formatCountdown(mission?.etaSeconds ?? tracking?.etaSeconds ?? 465)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {mission?.activeLeg === 'PICKUP'
                ? 'Até recolha na banca'
                : 'Até chegada ao seu local'}
            </p>
          </div>

          <div className="rounded-xl bg-muted/60 p-3">
            <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Compass className="size-3.5 text-primary" />
              Distância & Geofence
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-foreground tabular-nums">
              {(mission?.distanceKm ?? tracking?.distanceKm ?? 1.8).toFixed(2)} km
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Raio Geofence: {mission?.geofenceRadiusMeters || 120}m
            </p>
          </div>

          <div className="rounded-xl bg-muted/60 p-3 flex flex-col justify-between gap-1.5">
            <div>
              <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Bike className="size-3.5 text-primary" />
                Estafeta Kitingo
              </p>
              <p className="mt-1 truncate text-sm font-bold text-foreground">
                {mission?.driverName || tracking?.driverName || 'Paulo Sebastião'}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {mission?.vehiclePlate || tracking?.vehicleInfo || 'LD-44-92-AO'} ·{' '}
                {mission?.driverPhone || tracking?.driverPhone || '+244 931 880 210'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCustomerStartCall}
              className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#16A34A] px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 cursor-pointer"
            >
              <PhoneCall className="size-3" />
              <span>Ligar ao Estafeta</span>
            </button>
          </div>

          <div className="rounded-xl bg-muted/60 p-3">
            <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Store className="size-3.5 text-primary" />
              Coordenadas GPS Estafeta
            </p>
            <p className="mt-1 truncate text-xs font-bold text-foreground">
              {mission?.bancaName || tracking?.currentStreet || 'Praça dos Correios, Luanda'}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {driverPos.lat.toFixed(4)}, {driverPos.lng.toFixed(4)}
            </p>
          </div>
        </div>

        {statusToast && (
          <div className="flex items-center gap-2 border-b border-border bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{statusToast}</span>
          </div>
        )}

        {/* Drawer/Panel for "Atualizar Local de Entrega" */}
        {editingLocation && (
          <div className="border-b border-border bg-muted/30 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  Atualizar Coordenadas ou Bairro de Entrega em Luanda
                </h2>
                <p className="text-xs text-muted-foreground">
                  Selecione um ponto rápido, use o seu GPS atual ou clique diretamente no mapa.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleUseDeviceGps}
                disabled={updatingDestination}
                className="h-9 rounded-xl text-xs font-semibold"
              >
                <LocateFixed className="mr-1.5 size-3.5 text-primary" />
                Usar Meu GPS Atual
              </Button>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {LUANDA_DELIVERY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={updatingDestination}
                  onClick={() => applyNewDestination(preset.lat, preset.lng, preset.label)}
                  className="flex items-start gap-2 rounded-xl border border-border bg-card p-2.5 text-left text-xs transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{preset.label}</p>
                    <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      {preset.lat.toFixed(4)}, {preset.lng.toFixed(4)}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <form
              onSubmit={handleCustomFormSubmit}
              className="grid grid-cols-1 gap-2 sm:grid-cols-4"
            >
              <Input
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
                placeholder="Referência / Rua de Entrega"
                className="h-10 rounded-xl sm:col-span-2"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                  placeholder="Lat (-8.829)"
                  className="h-10 rounded-xl font-mono text-xs"
                />
                <Input
                  value={customLng}
                  onChange={(e) => setCustomLng(e.target.value)}
                  placeholder="Lng (13.234)"
                  className="h-10 rounded-xl font-mono text-xs"
                />
              </div>
              <Button
                type="submit"
                disabled={updatingDestination}
                className="h-10 rounded-xl bg-primary text-xs font-bold text-primary-foreground"
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                Confirmar Novo Local
              </Button>
            </form>
          </div>
        )}

        {/* Modular PostGIS + Google Maps Navigation Component (App do Cliente) */}
        <div className="p-3 bg-muted/20">
          <KitingoModularNavigation
            mode="customer"
            apiKey={apiKey}
            mission={{
              orderCode: mission?.orderCode || tracking?.orderId || activeOrder?.id || 'CE-650018',
              postgisId: (mission as any)?.postgisId || 'e856c0b8-df63-45df-8320-60707f0fb846',
              customerPhone: mission?.customerPhone || customerPhone || '+244 924 514 042',
              customerName: mission?.customerName || customerName || 'João Manuel Baptista',
              bancaCode: mission?.bancaCode || 'PC-008',
              bancaName: mission?.bancaName || 'Banca #08 - Peças do Zé',
              driverCode: mission?.driverCode || 'EST-019',
              driverName: mission?.driverName || tracking?.driverName || 'Paulo Sebastião',
              driverPhone: mission?.driverPhone || tracking?.driverPhone || '+244 931 880 210',
              vehiclePlate: mission?.vehiclePlate || 'LD-44-92-AO',
              missionState: activeMissionState,
              activeLeg: mission?.activeLeg || 'DESTINATION',
              driverLat: driverPos.lat,
              driverLng: driverPos.lng,
              pickupLat: origin.lat,
              pickupLng: origin.lng,
              pickupAddress: origin.label,
              destinationLat: destination.lat,
              destinationLng: destination.lng,
              destinationAddress: destination.label,
              distanceKm: mission?.distanceKm ?? tracking?.distanceKm ?? 1.4,
              distanceToTargetMeters: mission?.distanceToTargetMeters ?? 420,
              etaSeconds: mission?.etaSeconds ?? tracking?.etaSeconds ?? 420,
              geofenceRadiusMeters: mission?.geofenceRadiusMeters ?? 120,
              insidePickupGeofence: Boolean(mission?.insidePickupGeofence),
              insideDestinationGeofence: Boolean(mission?.insideDestinationGeofence),
              pickupWkt: (mission as any)?.pickupWkt,
              destinationWkt: (mission as any)?.destinationWkt,
              driverWkt: (mission as any)?.driverWkt,
              postgisDistanceToPickupMeters: (mission as any)?.postgisDistanceToPickupMeters,
              postgisDistanceToDestinationMeters: (mission as any)?.postgisDistanceToDestinationMeters,
              isOtpVerified: (mission as any)?.isOtpVerified,
              deliveryPin: mission?.deliveryPin || '2437',
              deliveryQrToken: mission?.deliveryQrToken || 'KT-DELIV-CE-650018-2437',
              routeHistory: mission?.routeHistory || [],
            }}
            onSimulateStep={loadCustomerMission}
          />
        </div>

        {/* Painel de Chamada Interativa do Comprador (Exclusivamente com o Estafeta) */}
        {customerCall && (
          <div
            role="dialog"
            aria-label={`Chamada em curso com ${customerCall.name}`}
            className="mx-3 mb-2 rounded-2xl border-2 border-[#16A34A] bg-slate-900 p-4 text-white shadow-xl space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#16A34A] text-white animate-pulse">
                  <PhoneCall className="size-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-amber-300">
                      {callPhase === 'ringing'
                        ? 'A CHAMAR...'
                        : `CHAMADA CONECTADA · ${formatCallTime(callSeconds)}`}
                    </span>
                    <span className="text-xs text-slate-300">{customerCall.subtitle}</span>
                  </div>
                  <p className="mt-1 text-sm font-black text-white">{customerCall.name}</p>
                  <p className="font-mono text-xs text-emerald-400">{customerCall.phone}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCallMuted((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer ${
                    callMuted
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {callMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                  <span>{callMuted ? 'Som Off' : 'Microfone On'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCallSpeaker((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer ${
                    callSpeaker
                      ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <Volume2 className="size-3.5" />
                  <span>{callSpeaker ? 'Altifalante On' : 'Normal'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCustomerEndCall}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-3.5 py-2 text-xs font-black text-white hover:opacity-90 cursor-pointer"
                >
                  <PhoneOff className="size-3.5" />
                  <span>Terminar</span>
                </button>
              </div>
            </div>

            {callReply && (
              <div className="rounded-xl border border-emerald-500/30 bg-slate-950/90 p-3 text-xs font-medium text-emerald-300">
                🔊 {callReply}
              </div>
            )}

            <div className="border-t border-slate-800 pt-2.5">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <MessageSquare className="size-3.5 text-amber-400" />
                <span>Enviar instrução rápida para {customerCall.name}:</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Estou a aguardar no ponto de entrega com o PIN de 4 dígitos.',
                  'Ligue-me quando estiver a chegar à rua indicada.',
                  'Pode estacionar em frente à oficina / portão principal.',
                ].map((msgText) => (
                  <button
                    key={msgText}
                    type="button"
                    onClick={() => {
                      kitingoCallAudio.playMessageSentBeep()
                      setCallQuickNote(msgText)
                      setCallReply(getSimulatedVoiceReply('ESTAFETA', msgText))
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-200 hover:border-amber-500/50 hover:text-white transition cursor-pointer"
                  >
                    “{msgText}”
                  </button>
                ))}
              </div>
              {callQuickNote && (
                <p className="mt-2 text-xs font-bold text-emerald-400">
                  ✓ Instrução transmitida: “{callQuickNote}”
                </p>
              )}
            </div>
          </div>
        )}

        {/* Route History Trail Summary Footer — Comprador liga apenas ao Estafeta */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
            <span>
              <strong className="text-foreground">Proteção Escrow & Geofencing:</strong> PIN{' '}
              <strong className="font-mono text-foreground">{mission?.deliveryPin || '2437'}</strong> ·{' '}
              <span className="inline-flex items-center gap-1">
                <History className="size-3.5 text-[#7C3AED]" />
                {mission?.routeHistory?.length || 3} pontos de rota registados
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeOrder && (
              <span className="font-mono font-bold text-foreground tabular-nums">
                Pedido {activeOrder.id} · {formatKz(activeOrder.amount)}
              </span>
            )}
            <button
              type="button"
              onClick={handleCustomerStartCall}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 py-1.5 font-bold text-white hover:opacity-90 cursor-pointer"
            >
              <PhoneCall className="size-3.5" />
              <span>
                Ligar ao Estafeta ({mission?.driverPhone || tracking?.driverPhone || '+244 931 880 210'})
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmação de Receção da Peça + Avaliação do Estafeta e da Peça na Banca */}
      <KitingoDeliveryRatingCenter
        mode="customer"
        orderCode={mission?.orderCode || tracking?.orderId || activeOrder?.id || 'CE-650018'}
        customerName={mission?.customerName || customerName || 'João Manuel Baptista'}
        customerPhone={mission?.customerPhone || customerPhone || '+244 924 514 042'}
        driverCode={mission?.driverCode || 'EST-019'}
        driverName={mission?.driverName || tracking?.driverName || 'Paulo Sebastião'}
        bancaCode={mission?.bancaCode || 'PC-008'}
        bancaName={mission?.bancaName || 'Banca #08 - Peças do Zé'}
        partName={
          activeOrder?.items?.[0]?.name ||
          'Alternador Denso 12V 90A (Toyota Hilux / Prado)'
        }
        deliveryPin={mission?.deliveryPin || '2437'}
        isDeliveredInitial={
          activeMissionState === 'DELIVERY_CONFIRMED' || tracking?.status === 'entregue'
        }
        onReceptionConfirmed={() => {
          setMission((prev) =>
            prev
              ? { ...prev, missionState: 'DELIVERY_CONFIRMED', etaSeconds: 0, distanceKm: 0 }
              : prev,
          )
        }}
      />

      {/* Central de Tickets do Comprador -> Encaminhamento ao Back-Office */}
      <KitingoTicketCenter
        role="cliente"
        reporterName={mission?.customerName || customerName || 'João Manuel Baptista'}
        reporterPhone={mission?.customerPhone || customerPhone || '+244 924 514 042'}
        defaultOrderCode={mission?.orderCode || tracking?.orderId || activeOrder?.id || 'CE-650018'}
        defaultBancaCode={mission?.bancaCode || 'PC-008'}
        defaultBancaName={mission?.bancaName || 'Banca #08 - Peças do Zé'}
      />
    </div>
  )
}

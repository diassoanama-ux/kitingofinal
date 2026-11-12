'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  ImagePlus,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatKz, type ConditionFilter, type Product } from '@/lib/products'

export type VendorQuote = {
  quoteId: string
  bancaCode: string
  bancaName: string
  condition: 'nova' | 'ocasiao'
  brand: string
  warrantyLabel: string
  price: number
  availabilityText: string
  productId: string
}

export type SampleMatchRequest = {
  matchCode: string
  customerName?: string | null
  customerPhone?: string | null
  vehicleModel: string
  vehicleYear: string
  partNotes?: string | null
  preferredCondition: ConditionFilter
  photos: string[]
  status: string
  vendorQuotes: VendorQuote[]
  createdAt: number
}

const SAMPLE_OLD_PART_PRESETS = [
  {
    label: 'Kit 3 Fotos · Alternador Hilux Antigo',
    model: 'Toyota Hilux 2.8 GD-6',
    year: '2019',
    notes: 'Alternador 150A com polia desgastada — etiqueta Denso visível',
    photos: [
      '/products/bateria.png',
      '/products/vela-ignicao.png',
      '/products/filtro-oleo.png',
    ],
  },
  {
    label: 'Kit 2 Fotos · Amortecedor Land Cruiser',
    model: 'Toyota Land Cruiser Prado',
    year: '2018',
    notes: 'Amortecedor dianteiro com fuga de óleo no retentor',
    photos: ['/products/amortecedor.png', '/products/pneu.png'],
  },
]

type MatchAmostraViewProps = {
  customerName?: string
  customerPhone?: string
  onAddMatchedProduct: (product: Product) => void
  onOpenCart: () => void
}

export function MatchAmostraView({
  customerName,
  customerPhone,
  onAddMatchedProduct,
  onOpenCart,
}: MatchAmostraViewProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [photos, setPhotos] = useState<string[]>([])
  const [vehicleModel, setVehicleModel] = useState('')
  const [vehicleYear, setVehicleYear] = useState('2019')
  const [partNotes, setPartNotes] = useState('')
  const [preferredCondition, setPreferredCondition] = useState<ConditionFilter>('Todos')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeMatch, setActiveMatch] = useState<SampleMatchRequest | null>(null)
  const [history, setHistory] = useState<SampleMatchRequest[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/match-amostra')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (mounted && Array.isArray(data?.matches)) {
          setHistory(data.matches)
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setError(null)

    const remainingSlots = Math.max(0, 3 - photos.length)
    const selected = files.slice(0, remainingSlots)

    selected.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPhotos((prev) => (prev.length < 3 ? [...prev, reader.result as string] : prev))
        }
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  function applySamplePreset(preset: (typeof SAMPLE_OLD_PART_PRESETS)[number]) {
    setPhotos(preset.photos)
    setVehicleModel(preset.model)
    setVehicleYear(preset.year)
    setPartNotes(preset.notes)
    setError(null)
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  function handleNextToVehicleStep() {
    if (photos.length < 2) {
      setError('Carregue ou capture pelo menos 2 fotos da peça antiga (frente e referência/encaixe).')
      return
    }
    setError(null)
    setStep(2)
  }

  async function handleSubmitToVendorQueue(e: React.FormEvent) {
    e.preventDefault()
    if (photos.length < 2) {
      setError('São necessárias entre 2 e 3 fotos da peça antiga.')
      setStep(1)
      return
    }
    if (!vehicleModel.trim()) {
      setError('Indique a marca e o modelo da viatura (ex.: Toyota Hilux 2.8).')
      return
    }
    if (!vehicleYear.trim()) {
      setError('Indique o ano da viatura (ex.: 2019).')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/match-amostra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName ?? 'Cliente Kitingo',
          customerPhone: customerPhone ?? null,
          vehicleModel: vehicleModel.trim(),
          vehicleYear: vehicleYear.trim(),
          partNotes: partNotes.trim(),
          preferredCondition,
          photos,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Falha ao enviar amostra para a fila das bancas.')
      }

      const created: SampleMatchRequest = data.match
      setActiveMatch(created)
      setHistory((prev) => [created, ...prev.filter((m) => m.matchCode !== created.matchCode)])
      setStep(3)
    } catch (err: any) {
      setError(err.message || 'Erro ao submeter pedido de Match por Amostra.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSelectQuote(quote: VendorQuote) {
    const matchedProduct: Product = {
      id: quote.productId || `match-${quote.quoteId}`,
      name: `${activeMatch?.vehicleModel || 'Peça'} · ${quote.brand} (Match ${activeMatch?.matchCode || ''})`,
      category: 'Peças de Motor',
      compatibility: `${activeMatch?.vehicleModel || 'Viatura'} (${activeMatch?.vehicleYear || ''})`,
      stall: parseInt(quote.bancaCode.replace(/\D/g, ''), 10) || 14,
      bancaCode: quote.bancaCode,
      bancaName: quote.bancaName,
      condition: quote.condition,
      brand: quote.brand,
      warrantyLabel: quote.warrantyLabel,
      price: quote.price,
      image: activeMatch?.photos?.[0] || '/products/vela-ignicao.png',
      inStock: 3,
    }
    onAddMatchedProduct(matchedProduct)
    onOpenCart()
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header Banner */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary uppercase">
              <Camera className="size-4 text-brand-accent" />
              Match Visual de Peças · Praça dos Correios
            </span>
            <h1 className="mt-1 text-xl font-bold text-foreground">
              Match por Amostra (2 a 3 Fotos)
            </h1>
            <p className="text-xs text-muted-foreground">
              Fotografe a sua peça antiga (frente, verso e número de série) e receba cotações imediatas das bancas especializadas.
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
            <Store className="size-4" />
            <span>Fila Ativa · 42 Bancas Online</span>
          </div>
        </div>

        {/* Stepper */}
        <ol className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
          {[
            { num: 1, title: '1. Fotos (2–3)' },
            { num: 2, title: '2. Viatura & Estado' },
            { num: 3, title: '3. Fila das Bancas' },
          ].map((item) => {
            const active = step === item.num
            const completed = step > item.num
            return (
              <li
                key={item.num}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 font-semibold ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : completed
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                <span className="truncate">{item.title}</span>
              </li>
            )
          })}
        </ol>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive">
          {error}
        </div>
      )}

      {/* STEP 1: PHOTO CAPTURE / UPLOAD (2-3 PHOTOS) */}
      {step === 1 && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold">Passo 1: Fotografe ou carregue 2 a 3 fotos</h2>
              <p className="text-xs text-muted-foreground">
                Recomendado: 1ª Foto Geral · 2ª Encaixe/Ficha · 3ª Código OEM gravado na peça
              </p>
            </div>
            <span className="font-mono text-xs font-bold tabular-nums">
              {photos.length}/3 fotos
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((slotIdx) => {
              const photoUrl = photos[slotIdx]
              const labels = ['1. Frente da Peça', '2. Encaixe / Traseira', '3. Etiqueta / Código (Opcional)']
              return (
                <div
                  key={slotIdx}
                  className="relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted/40 p-2 text-center"
                >
                  {photoUrl ? (
                    <>
                      <img
                        src={photoUrl}
                        alt={labels[slotIdx]}
                        className="h-full w-full rounded-xl object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(slotIdx)}
                        className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/75 text-white hover:bg-destructive"
                        aria-label={`Remover foto ${slotIdx + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        Foto #{slotIdx + 1}
                      </span>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ImagePlus className="size-6 text-primary" />
                      <span className="text-[11px] font-semibold leading-tight">{labels[slotIdx]}</span>
                      <span className="text-[10px] opacity-75">Câmara / Galeria</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={photos.length >= 3}
              className="h-10 rounded-xl text-xs font-semibold"
            >
              <Upload className="mr-1.5 size-4" />
              Abrir Câmara ou Galeria ({photos.length}/3)
            </Button>

            {SAMPLE_OLD_PART_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applySamplePreset(preset)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <Sparkles className="size-3.5" />
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex justify-end border-t border-border pt-3">
            <Button
              type="button"
              onClick={handleNextToVehicleStep}
              className="h-11 rounded-xl bg-brand-accent px-5 font-semibold text-brand-accent-foreground hover:bg-brand-accent/90"
            >
              Continuar para Dados da Viatura
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: VEHICLE MODEL / YEAR & CONDITION */}
      {step === 2 && (
        <form
          onSubmit={handleSubmitToVendorQueue}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold">Passo 2: Identifique a Viatura</h2>
              <p className="text-xs text-muted-foreground">
                Os mestres das bancas usam o modelo e o ano para confirmar a compatibilidade exata.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs font-semibold text-primary underline"
            >
              Editar fotos ({photos.length})
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="vehicle-model" className="mb-1 block text-xs font-semibold">
                Marca / Modelo / Motorização *
              </label>
              <Input
                id="vehicle-model"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder="Ex.: Toyota Hilux 2.8 GD-6 / Hyundai Tucson 2.0"
                required
                className="h-11 rounded-xl"
              />
            </div>

            <div>
              <label htmlFor="vehicle-year" className="mb-1 block text-xs font-semibold">
                Ano da Viatura *
              </label>
              <Input
                id="vehicle-year"
                value={vehicleYear}
                onChange={(e) => setVehicleYear(e.target.value)}
                placeholder="Ex.: 2019"
                required
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label htmlFor="part-notes" className="mb-1 block text-xs font-semibold">
              Observações da Peça Antiga ou Código Gravado
            </label>
            <Input
              id="part-notes"
              value={partNotes}
              onChange={(e) => setPartNotes(e.target.value)}
              placeholder="Ex.: Alternador 150A ficha de 4 pinos, barulho no rolamento"
              className="h-11 rounded-xl"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold">
              Preferência de Condição da Peça
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'Todos', label: 'Todos (Nova + Ocasião)' },
                  { id: 'nova', label: '🆕 Só Peças Novas' },
                  { id: 'ocasiao', label: '🔄 Ocasião (Garantia 72h)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPreferredCondition(opt.id)}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                    preferredCondition === opt.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              className="h-11 rounded-xl"
            >
              Voltar
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="h-11 rounded-xl bg-brand-accent px-5 font-semibold text-brand-accent-foreground hover:bg-brand-accent/90"
            >
              {submitting ? 'A transmitir para as Bancas...' : 'Enviar para Fila da Praça dos Correios'}
            </Button>
          </div>
        </form>
      )}

      {/* STEP 3: VENDOR QUEUE & LIVE QUOTES */}
      {step === 3 && activeMatch && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                Amostra #{activeMatch.matchCode} enviada para a fila das bancas!
              </span>
              <h2 className="mt-0.5 text-base font-bold">
                {activeMatch.vehicleModel} ({activeMatch.vehicleYear})
              </h2>
              {activeMatch.partNotes && (
                <p className="text-xs text-muted-foreground">{activeMatch.partNotes}</p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPhotos([])
                setStep(1)
              }}
              className="h-9 rounded-xl text-xs font-semibold"
            >
              Nova Amostra
            </Button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {activeMatch.photos.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Amostra ${i + 1}`}
                className="size-16 shrink-0 rounded-xl border border-border object-cover"
              />
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Respostas da Fila da Praça dos Correios ({activeMatch.vendorQuotes.length} bancas confirmaram stock)
            </h3>

            {activeMatch.vendorQuotes.map((quote) => {
              const isNew = quote.condition === 'nova'
              return (
                <div
                  key={quote.quoteId}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-background p-3.5 sm:flex-row sm:items-center"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary">
                        {quote.bancaCode}
                      </span>
                      <span className="text-sm font-bold">{quote.bancaName}</span>
                      {isNew ? (
                        <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          🆕 Nova · {quote.brand}
                        </span>
                      ) : (
                        <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-slate-950">
                          🔄 Ocasião · {quote.warrantyLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {quote.availabilityText} · Protegido por Escrow Zero Fiado EMIS
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-right">
                      <p className="text-base font-bold tabular-nums">{formatKz(quote.price)}</p>
                      <p className="text-[10px] text-muted-foreground">{quote.warrantyLabel}</p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => handleSelectQuote(quote)}
                      className="h-10 rounded-xl bg-brand-accent px-3.5 text-xs font-bold text-brand-accent-foreground hover:bg-brand-accent/90"
                    >
                      <ShoppingCart className="mr-1.5 size-3.5" />
                      Comprar Peça
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Previous Match por Amostra Queue History */}
      {history.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-bold text-foreground">
            Histórico na Fila da Praça dos Correios ({history.length})
          </h3>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {history.slice(0, 4).map((item) => (
              <div
                key={item.matchCode}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {item.photos?.[0] && (
                    <img
                      src={item.photos[0]}
                      alt=""
                      className="size-12 shrink-0 rounded-xl border border-border object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-primary">
                        #{item.matchCode}
                      </span>
                      <span className="truncate text-xs font-semibold">
                        {item.vehicleModel} ({item.vehicleYear})
                      </span>
                    </div>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="size-3" />
                      {item.photos.length} fotos · {item.vendorQuotes?.length || 2} cotações recebidas
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setActiveMatch(item)
                    setStep(3)
                  }}
                  className="h-8 shrink-0 rounded-lg px-2.5 text-xs font-semibold"
                >
                  Ver Cotações
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center gap-3 rounded-2xl bg-primary/5 p-3 ring-1 ring-primary/10">
        <ShieldCheck className="size-6 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Garantia de Compatibilidade Kitingo:</strong> Se a peça enviada por
          Match por Amostra não encaixar na viatura, o valor em Escrow EMIS é devolvido ou trocado em 72h.
        </p>
      </div>
    </div>
  )
}

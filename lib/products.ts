export type Category =
  | 'Todas'
  | 'Peças de Motor'
  | 'Suspensão'
  | 'Eletrónica'
  | 'Pneus'
  | 'Óleos & Lubrificantes'

export type PartCondition = 'nova' | 'ocasiao'
export type ConditionFilter = 'Todos' | 'nova' | 'ocasiao'

export const categories: Category[] = [
  'Todas',
  'Peças de Motor',
  'Suspensão',
  'Eletrónica',
  'Pneus',
  'Óleos & Lubrificantes',
]

export type Product = {
  id: string
  name: string
  category: Exclude<Category, 'Todas'>
  compatibility: string
  stall: number
  bancaCode: string
  bancaName: string
  condition: PartCondition
  brand: string
  warrantyLabel: string
  price: number
  image: string
  inStock: number
}

export const products: Product[] = [
  {
    id: 'vela-ngk-4',
    name: 'Vela de ignição Iridium (kit 4)',
    category: 'Peças de Motor',
    compatibility: 'Toyota Hilux 2018-2023',
    stall: 14,
    bancaCode: 'PC-014',
    bancaName: 'Auto Peças Cassenda & Filhos',
    condition: 'nova',
    brand: 'NGK Laser Iridium',
    warrantyLabel: 'Selada · Original de Fábrica',
    price: 18500,
    image: '/products/vela-ignicao.png',
    inStock: 12,
  },
  {
    id: 'amortecedor-dianteiro',
    name: 'Amortecedor dianteiro a gás (Original Recondicionado)',
    category: 'Suspensão',
    compatibility: 'Toyota Land Cruiser 2015-2022',
    stall: 7,
    bancaCode: 'PC-007',
    bancaName: 'Banca Irmãos Bastos · Suspensões',
    condition: 'ocasiao',
    brand: 'Toyota OEM Tokico',
    warrantyLabel: 'Garantia 72h de Teste',
    price: 64000,
    image: '/products/amortecedor.png',
    inStock: 4,
  },
  {
    id: 'filtro-oleo',
    name: 'Filtro de óleo de alta filtragem',
    category: 'Peças de Motor',
    compatibility: 'Hyundai Accent / i10 2012-2021',
    stall: 22,
    bancaCode: 'PC-022',
    bancaName: 'Central Coreana Correios',
    condition: 'nova',
    brand: 'Bosch Premium',
    warrantyLabel: 'Novo na Caixa',
    price: 6500,
    image: '/products/filtro-oleo.png',
    inStock: 30,
  },
  {
    id: 'pneu-at-265',
    name: 'Pneu All-Terrain 265/65 R17',
    category: 'Pneus',
    compatibility: 'Toyota Hilux / Fortuner / Prado',
    stall: 3,
    bancaCode: 'PC-003',
    bancaName: 'Pneus & Jantes Ingombota',
    condition: 'nova',
    brand: 'Bridgestone Dueler A/T',
    warrantyLabel: 'DOT Recente · Garantia Oficial',
    price: 92000,
    image: '/products/pneu.png',
    inStock: 8,
  },
  {
    id: 'oleo-5w30',
    name: 'Óleo sintético 5W-30 Dexos (4L)',
    category: 'Óleos & Lubrificantes',
    compatibility: 'Motores a gasolina e diesel DPF',
    stall: 14,
    bancaCode: 'PC-014',
    bancaName: 'Auto Peças Cassenda & Filhos',
    condition: 'nova',
    brand: 'Mobil 1 ESP Formula',
    warrantyLabel: 'Lacre Anti-Falsificação',
    price: 24900,
    image: '/products/oleo-motor.png',
    inStock: 20,
  },
  {
    id: 'bateria-70ah',
    name: 'Bateria 12V 70Ah selada',
    category: 'Eletrónica',
    compatibility: 'Kia Sportage / Hyundai Tucson 2016-2022',
    stall: 31,
    bancaCode: 'PC-031',
    bancaName: 'ElectroAuto Praça dos Correios',
    condition: 'nova',
    brand: 'Moura 70Ah Blindada',
    warrantyLabel: 'Garantia 12 Meses',
    price: 58000,
    image: '/products/bateria.png',
    inStock: 6,
  },
  {
    id: 'alternador-hilux-ocasiao',
    name: 'Alternador 12V 150A Original Testado em Bancada',
    category: 'Eletrónica',
    compatibility: 'Toyota Hilux 2.4 / 2.8 GD-6 (2016-2022)',
    stall: 19,
    bancaCode: 'PC-019',
    bancaName: 'Banca do Mestre Bento · Motores & Elétrica',
    condition: 'ocasiao',
    brand: 'Denso Original Japão',
    warrantyLabel: 'Garantia 72h de Teste',
    price: 78000,
    image: '/products/bateria.png',
    inStock: 3,
  },
  {
    id: 'bomba-injetora-pajero-ocasiao',
    name: 'Corpo de Injeção / Bomba de Alta Pressão (Ocasião)',
    category: 'Peças de Motor',
    compatibility: 'Mitsubishi Pajero / L200 Triton 3.2 DID',
    stall: 28,
    bancaCode: 'PC-028',
    bancaName: 'Diesel & Turbo Correios',
    condition: 'ocasiao',
    brand: 'Denso OEM Recondicionado',
    warrantyLabel: 'Garantia 72h de Teste',
    price: 135000,
    image: '/products/vela-ignicao.png',
    inStock: 2,
  },
  {
    id: 'braco-suspensao-tucson-ocasiao',
    name: 'Braço Oscilante Inferior c/ Rótula (Meia-Vida Original)',
    category: 'Suspensão',
    compatibility: 'Hyundai Tucson / Kia Sportage 2016-2021',
    stall: 7,
    bancaCode: 'PC-007',
    bancaName: 'Banca Irmãos Bastos · Suspensões',
    condition: 'ocasiao',
    brand: 'Hyundai Mobis OEM',
    warrantyLabel: 'Garantia 72h de Teste',
    price: 39500,
    image: '/products/amortecedor.png',
    inStock: 5,
  },
]

export const DELIVERY_FEE = 2500

const aoaFormatter = new Intl.NumberFormat('pt-AO', {
  maximumFractionDigits: 0,
})

export function formatKz(value: number) {
  return `${aoaFormatter.format(value)} Kz`
}


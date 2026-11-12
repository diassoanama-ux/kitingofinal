import { Storefront } from '@/components/storefront'

type PageProps = {
  customerName?: string
  customerPhone?: string
}

export default function Page({ customerName, customerPhone }: PageProps = {}) {
  return <Storefront customerName={customerName} customerPhone={customerPhone} />
}

import { POStatus } from '../../types'

export const PO_STATUS_SEQUENCE: POStatus[] = ['draft', 'ordered', 'shipped', 'closed', 'cancelled']

export function nextStatus(current: POStatus): POStatus | null {
  const idx = PO_STATUS_SEQUENCE.indexOf(current)
  if (idx === -1 || idx === PO_STATUS_SEQUENCE.length - 1) return null
  return PO_STATUS_SEQUENCE[idx + 1]
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AE', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const STATUS_TABS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Ordered', value: 'ordered' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Closed', value: 'closed' },
  { label: 'Cancelled', value: 'cancelled' },
]

export interface LineItemInput {
  sku: string
  units_ordered: number
  units_received: number
  units_per_box: number
  box_count: number
  dimensions: string
  cogs_per_unit: number
  shipping_cost_per_unit: number
  notes: string
}

export interface NewPOForm {
  po_number: string
  po_name: string
  supplier: string
  order_date: string
  eta: string
  tracking_number: string
  notes: string
  line_items: LineItemInput[]
}

export function emptyForm(): NewPOForm {
  return {
    po_number: '',
    po_name: '',
    supplier: '',
    order_date: new Date().toISOString().slice(0, 10),
    eta: '',
    tracking_number: '',
    notes: '',
    line_items: [{ 
      sku: '', 
      units_ordered: 0, 
      units_received: 0,
      units_per_box: 0, 
      box_count: 0, 
      dimensions: '', 
      cogs_per_unit: 0, 
      shipping_cost_per_unit: 0,
      notes: ''
    }],
  }
}

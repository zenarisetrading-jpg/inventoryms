export const COLORS: Record<string, string> = {
  amazon: '#f59e0b',        // Amber
  noon: '#3b82f6',          // Blue
  minutes: '#8b5cf6',       // Purple
  total: '#64748b',         // Slate
}

export const VAL_COLORS: Record<string, string> = {
  'AMAZON FBA': '#f59e0b',
  'NOON FBN': '#3b82f6',
  'NOON MINUTES': '#8b5cf6',
  'LOCAD WAREHOUSE': '#10b981',
}

export const PO_STATUS_COLORS: Record<string, string> = {
  DRAFT: '#64748b',
  ORDERED: '#3b82f6',
  SHIPPED: '#f59e0b',
  CLOSED: '#10b981',
  CANCELLED: '#ef4444',
}

export const aed = (n: any) => `AED ${Number(n || 0).toLocaleString()}`

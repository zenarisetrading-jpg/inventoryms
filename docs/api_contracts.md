# S2C Inventory OS — API Contracts

All Edge Functions are invoked at:
`${VITE_SUPABASE_URL}/functions/v1/<function-name>`

With header: `Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}`

---

## GET /functions/v1/dashboard

Returns the command center state — all actionable items grouped by priority.

```typescript
interface CommandCenterResponse {
  alerts: {
    sku: string
    name: string
    risk: string          // 'CRITICAL_OOS_RISK' | 'OOS_RISK'
    coverage_days: number
  }[]
  ship_now: {
    sku: string
    name: string
    boxes: number
    units: number
    destination: InventoryNode
    plan_id: string
  }[]
  reorder_now: {
    sku: string
    name: string
    category: SKUCategory
    suggested_units: number
    blended_sv: number
  }[]
  transfers: {
    sku: string
    from: InventoryNode
    to: InventoryNode
    units: number
    boxes: number
  }[]
  inbound: {
    po_number: string
    sku: string
    name: string
    units: number
    eta: string
    status: POStatus
  }[]
  excess: {
    sku: string
    name: string
    node: InventoryNode
    coverage_days: number
  }[]
  last_synced: string  // ISO timestamp
}
```

---

## GET /functions/v1/skus

Query params: `?search=&category=A|B|C&flag=SHIP_NOW`

```typescript
interface SKUListResponse {
  skus: (SKU & {
    demand: { blended_sv: number }
    action_flag: ActionFlag
  })[]
}
```

## GET /functions/v1/skus/:sku

```typescript
interface SKUDetailResponse {
  sku: string
  name: string
  category: SKUCategory
  units_per_box: number
  moq: number
  lead_time_days: number
  demand: {
    sv_7: number
    sv_90: number
    blended_sv: number
  }
  supply: {
    amazon_fba: {
      available: number
      inbound: number
      reserved: number
      coverage_days: number
    }
    noon_fbn: {
      available: number
      inbound: number
      coverage_days: number
    }
    locad_warehouse: {
      available: number
      inbound: number
      coverage_days: number
    }
  }
  total_coverage_days: number
  projected_coverage_days: number
  action_flag: ActionFlag
  pending_pos: {
    po_number: string
    units_incoming: number
    eta: string
    status: POStatus
  }[]
}
```

---

## PO Register

### GET /functions/v1/po
Query params: `?status=&sku=&supplier=`

### POST /functions/v1/po
Body:
```json
{
  "po_number": "PO-001",
  "supplier": "Supplier Name",
  "order_date": "2026-02-01",
  "eta": "2026-03-15",
  "line_items": [
    { "sku": "SKU001", "units_ordered": 500 }
  ]
}
```

### PATCH /functions/v1/po/:id
Body (status advance): `{ "status": "ordered" }`
Body (field update): `{ "eta": "2026-03-20", "notes": "Updated ETA" }`

### DELETE /functions/v1/po/:id
Soft deletes — sets status to 'closed'.

---

## Upload Endpoints

### POST /functions/v1/upload-noon
Multipart form data, field name: `file` (order-level CSV)

Response:
```json
{
  "rows_processed": 1250,
  "skus_updated": ["SKU001", "SKU002"],
  "errors": [
    { "row": 5, "message": "Missing partner_sku" }
  ]
}
```

### POST /functions/v1/upload-locad-report
Multipart form data, field name: `file` (xlsx)

Response:
```json
{
  "upload_id": "uuid",
  "report_date": "2026-02-27",
  "rows_parsed": 163,
  "rows_matched": 37,
  "rows_unmatched": 126,
  "unmatched_skus": ["12OZCMAMBERLEAF", "18OZBABYWHALE"],
  "status": "partial"
}
```

### GET /functions/v1/upload-locad-report/unmatched
Returns all Locad SKUs with no mapping:
```json
{
  "unmatched": [
    { "locad_sku": "12OZCMAMBERLEAF", "product_name": "12oz Camping Mug Amber Leaf" }
  ]
}
```

### POST /functions/v1/upload-locad-report/map
Body: `{ "locad_sku": "12OZCMAMBERLEAF", "internal_sku": "SKU001" }`
Response: `{ "ok": true }`

---

## Sync

### POST /functions/v1/sync/:source
Source: `amazon | locad | all`

Response:
```json
{
  "status": "ok",
  "synced_at": "2026-02-27T06:00:00Z",
  "skus_processed": 150,
  "locad_status": "skipped_not_connected"
}
```

### GET /functions/v1/sync/status

```json
{
  "amazon": { "status": "connected", "last_synced": "2026-02-27T06:00:00Z" },
  "locad_api": { "status": "not_connected", "credentials_configured": false },
  "locad_xlsx": { "last_uploaded": "2026-02-27", "rows_matched": 37, "rows_unmatched": 126 },
  "noon_csv": { "last_uploaded": "2026-02-27" }
}
```

---

## Types Reference

```typescript
type SKUCategory = 'A' | 'B' | 'C'
type POStatus = 'draft' | 'ordered' | 'shipped' | 'in_transit' | 'arrived' | 'closed'
type InventoryNode = 'amazon_fba' | 'noon_fbn' | 'locad_warehouse'
type ActionFlag = 'CRITICAL_OOS_RISK' | 'OOS_RISK' | 'SHIP_NOW' | 'REORDER' | 'TRANSFER' | 'EXCESS' | 'OK'
```

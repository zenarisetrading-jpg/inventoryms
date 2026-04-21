# Purchase Order Register Spec

## Purpose
Track ordered and incoming stock.

## Status Flow
Draft → Ordered → Shipped → In Transit → Arrived → Closed

## Key Logic
Incoming supply counts toward coverage when status ≥ Ordered.

## Dashboard View
SKU, Incoming Units, ETA, Supplier

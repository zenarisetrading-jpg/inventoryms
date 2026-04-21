# S2C Inventory Operating System — Architecture

## Objective
Build a hybrid supply chain decision system integrating:
- Amazon (API via Saddl)
- Locad Warehouse (API)
- Noon (Manual Upload)
- Purchase Order Register (Manual entry)

## Architecture Layers

### 1. Demand Layer
Calculates sales velocity using:
- 7-day rolling average
- 90-day rolling average

BlendedSV = (SV7 × 0.6) + (SV90 × 0.4)

### 2. Supply Layer — Current
Amazon Node (API): FBA Available, Inbound, Reserved
Noon Node (Upload): FBN Available, Inbound
Warehouse Node (Locad API): Sellable, Pending Putaway, Inbounded

### 3. Supply Layer — Incoming
Purchase Order Register tracks ordered and in-transit stock.

### 4. Decision Engine
Coverage, Allocation, Reorder, Transfer modules.

### 5. Execution Layer
Outputs actions: Ship, Reorder, Transfer, Hold

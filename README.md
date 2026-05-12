# S2C Inventory Planner & Logistics OS

A high-performance inventory management and replenishment planning system built with **React**, **Supabase Edge Functions**, and **PostgreSQL**.

## 🏗️ Project Architecture

### 1. Frontend (`/frontend`)
- **Framework**: Vite + React + TypeScript
- **Styling**: Vanilla CSS + Tailwind
- **Key Pages**:
  - `Command Center`: High-level fleet health and urgent signals.
  - `Inventory Matrix`: Detailed planning grid with automated reorder logic.
  - `PO Register`: Purchase order management and status tracking.
  - `SKU Master`: Central product catalog management.

### 2. Backend (`/supabase`)
- **Database**: PostgreSQL (Managed by Supabase)
- **Edge Functions**: TypeScript (Deno runtime)
  - `planning`: Computes coverage, SV, and reorder triggers.
  - `dashboard`: Aggregates cross-channel data for the Command Center.
  - `po`: Manages Purchase Order CRUD and filtering.
  - `sync`: Orchestrates data ingestion from multiple channels.

### 3. Data Flow
1. **Ingestion**: Raw CSVs from Amazon, Noon, and Locad are uploaded.
2. **Fact Processing**: `refresh_fact_inventory_planning()` aggregates snapshots and sales into a flat planning table.
3. **Logic Layer**: Edge Functions apply business logic (e.g., Tier A/B/C thresholds) to generate reorder signals.
4. **UI**: The React frontend provides interactive sorting, filtering, and drill-down analysis.

## 🚀 Getting Started

### Local Development
1. Run the bootstrapper:
   ```powershell
   ./START_APP.ps1
   ```
2. The portal will be available at `http://localhost:5173`.

### Deployment
To deploy backend fixes:
```powershell
npx supabase functions deploy <function_name> --project-ref eiezhzlpirdiqsotvogx
```

## 📂 Directory Structure
- `/data/source`: Central repository for raw data files.
- `/scripts`: Utility scripts for auditing and manual synchronization.
- `/supabase/migrations`: Version-controlled database schema changes.

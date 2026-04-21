# Data Model

## Core Tables

### SKU_Master
SKU, Category (A/B/C), UnitsPerBox, MOQ, LeadTimeDays

### Sales_Snapshot
SKU, Date, UnitsSold

### Inventory_Snapshot
SKU, Node (Amazon/Noon/Warehouse), Available, Inbound, Reserved

### PO_Register
PO_Number, Supplier, OrderDate, ETA, Status
Line Items: SKU, UnitsOrdered, UnitsReceived

### Allocation_Plans
SKU, Date, Node, BoxesToShip, Status

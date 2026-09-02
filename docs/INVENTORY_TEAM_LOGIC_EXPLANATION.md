# S2C Inventory Planning & Replenishment Logic Guide
### Business Logic Explanation for the Inventory & Operations Team

---

## 📌 Purpose of this Document
This document explains the **exact calculation rules and business logic** currently used in the Inventory Planning System. 

Please review each section and confirm if these rules match your business requirements, or let us know if any formula, buffer, or priority needs adjustment.

---

## 1. Sales Velocity (Sales Speed) Calculation

### How It Works:
The system tracks unit sales across all channels over the **last 30 rolling days**:

* **Amazon Sales Velocity (`amazon_sv`)** = Total Amazon units sold in last 30 days $\div 30$
* **Noon FBN Sales Velocity (`noon_sv`)** = Total Noon FBN units sold in last 30 days $\div 30$
* **Noon Minutes Velocity (`minutes_sv`)** = Total Minutes units sold in last 30 days $\div 30$
* **Blended Total Velocity (`blended_sv`)** = `amazon_sv` + `noon_sv` + `minutes_sv`

#### Example:
* Amazon 30-Day Sales = **60 units** $\rightarrow$ Amazon Velocity = **2.0 units/day**
* Noon 30-Day Sales = **15 units** $\rightarrow$ Noon Velocity = **0.5 units/day**
* **Total Blended Velocity** = $2.0 + 0.5 =$ **2.5 units/day**

---

## 2. Total Stock-in-Hand & Coverage (Days of Stock)

### Total Stock-in-Hand:
$$\text{Total Stock} = \text{Amazon FBA Units} + \text{Noon FBN Units} + \text{Noon Minutes Units} + (\text{Locad Warehouse Boxes} \times \text{Units per Box})$$

### Days of Coverage:
* **Amazon Coverage** = $\text{Amazon FBA Units} \div \text{Amazon Velocity}$
* **Noon Coverage** = $\text{Noon FBN Units} \div \text{Noon Velocity}$
* **Total Business Coverage** = $\text{Total Stock-in-Hand} \div \text{Blended Total Velocity}$

#### Example:
* Total Stock across all locations = **100 units**
* Total Blended Velocity = **2.5 units/day**
* **Total Coverage** = $100 \div 2.5 =$ **40 Days of Stock**

---

## 3. Stock Health Alerts & Action Flags

The system assigns an action badge to every SKU based on total coverage:

| Status Badge | Trigger Condition | Meaning |
| :--- | :--- | :--- |
| 🔴 **CRITICAL_OOS_RISK** | Total Coverage $< 14$ Days (and product is selling) | High risk of running completely out of stock in under 2 weeks. |
| 🟡 **OOS_RISK** | Total Coverage between $14$ and $30$ Days | Stock is low; replenishment needed soon. |
| 🔵 **REORDER_NOW** | Suggested Reorder Quantity $> 0$ | Stock is below the target safety buffer; place a factory order. |
| 🟣 **OVERSTOCKED** | Total Coverage $> 90$ Days | More than 3 months of inventory in hand. |
| 🟢 **OK** | Healthy stock levels ($30$ to $90$ Days) | Inventory is well balanced. |

---

## 4. Factory Reorder Logic (Supplier Procurement)

When stock runs low, the system calculates the exact number of units to order from your manufacturer.

### Step 1: Target Coverage by Product Category (ABC Classification)
* **Class A Products** (Top Revenue Drivers): Target Buffer = **60 Days of Stock**
* **Class B Products** (Moderate Volume): Target Buffer = **45 Days of Stock**
* **Class C Products** (Slow Movers / Others): Target Buffer = **30 Days of Stock**

### Step 2: Calculate Stock Shortfall
$$\text{Required Target Buffer} = \text{Blended Daily Sales Velocity} \times \text{Target Days (60, 45, or 30)}$$
$$\text{Shortfall} = \text{Required Target Buffer} - \text{Total Stock-in-Hand}$$

### Step 3: Carton Pack Rounding & Factory MOQ
1. **Carton Rounding**: Reorders are always rounded **UP** to full carton multiples ($\text{units\_per\_box}$).
2. **Factory MOQ**: If the required order is below the factory Minimum Order Quantity, the system enforces the **MOQ**.
3. **Threshold**: If shortfall is less than 1 full box, reorder is set to **0**.

### Step 4: Deduct Open Inbound Purchase Orders
$$\text{Net To Order} = \text{Suggested Reorder Quantity} - \text{Already Ordered Inbound POs}$$

---

### 📝 Reorder Example:
* **Product**: 40OZ Water Bottle (Class B $\rightarrow$ **45 Days Target**)
* **Box Pack**: 25 units/box
* **Factory MOQ**: 100 units
* **Sales Speed**: 4.0 units/day
* **Stock in Hand**: 70 units
* **Inbound PO**: 50 units already ordered from supplier

```text
1. Target Stock Needed:
   4.0 units/day * 45 days = 180 units

2. Gross Shortfall:
   180 required - 70 in hand = 110 units shortfall

3. Carton Rounding:
   ceil(110 / 25) = 5 boxes = 125 units

4. Factory MOQ Check:
   max(100 MOQ, 125 units) = 125 units (Suggested Order)

5. Deduct Already Ordered POs:
   125 suggested - 50 inbound = 75 units (3 full boxes) to order now.
```

---

## 5. Warehouse Dispatch Allocation Logic ("Ship Now")

When you have inventory in your central **Locad Warehouse**, the system automatically calculates how many boxes to dispatch to **Amazon FBA**, **Noon FBN**, and **Noon Minutes**.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        HOW ALLOCATION WORKS                            │
└────────────────────────────────────────────────────────────────────────┘
  1. CHANNEL NEED CALCULATION:
     • Each channel asks for 30 days of stock based on its sales velocity.
     • If a channel has 0 stock and 0 sales, it requests 1 Seed Box to start sales.
     • If a channel is toggled OFF (Inactive), it gets 0 boxes.

  2. PRIORITY RANKING:
     • Channels are ranked by daily sales speed:
       Rank 1: Highest Sales Speed
       Rank 2: Second Highest Speed
       Rank 3: Lowest / Zero Sales

  3. WATERFALL DISPATCH:
     • Locad boxes are given to Rank 1 first.
     • Any remaining boxes are passed to Rank 2, then Rank 3.
```

---

### 📝 Allocation Examples:

#### Example A: Plenty of Stock in Warehouse
* **Locad Warehouse**: **4 boxes** available (100 units). Box size = 25 units.
* **Amazon FBA**: 0 units in stock, sells 1.5 units/day $\rightarrow$ Needs **2 boxes** (50 units) $\rightarrow$ **Rank 1**
* **Noon FBN**: 0 units in stock, sells 0.5 units/day $\rightarrow$ Needs **1 box** (25 units) $\rightarrow$ **Rank 2**
* **Result**:
  * Ship to Amazon: **2 Boxes**
  * Ship to Noon: **1 Box**
  * Remaining in Locad: **1 Box**

#### Example B: Limited Stock (Scarcity Handling)
* **Locad Warehouse**: Only **1 box** available (25 units).
* **Amazon FBA**: Sells 1.5 units/day $\rightarrow$ **Rank 1** (Needs 1 box)
* **Noon FBN**: Sells 0.0 units/day $\rightarrow$ **Rank 2** (Requests 1 seed box)
* **Result**:
  * Ship to Amazon: **1 Box** (Rank 1 prioritized)
  * Ship to Noon: **0 Boxes** (No stock remaining)

---

## 6. Checklist for Inventory Team Confirmation

Please review and confirm the following questions:

- [ ] **1. Sales Period**: Is **30 rolling days** the right timeframe for calculating sales speed, or would you prefer 7-day, 14-day, or 60-day weighting?
- [ ] **2. Safety Stock Targets**:
  - Class A = **60 Days**
  - Class B = **45 Days**
  - Class C = **30 Days**  
  *Are these targets appropriate for your lead times?*
- [ ] **3. Inbound PO Deduction**: Do you agree that POs in status `Ordered`, `Shipped`, and `In_Transit` should be deducted from suggested reorders?
- [ ] **4. Exploratory Seed Box**: When launching a SKU on Noon/Amazon with 0 sales and 0 stock, do you want the system to allocate **1 exploratory test box** automatically?
- [ ] **5. Channel Priority**: Do you agree that the central warehouse should always satisfy the **highest-velocity sales channel first** when stock is limited?

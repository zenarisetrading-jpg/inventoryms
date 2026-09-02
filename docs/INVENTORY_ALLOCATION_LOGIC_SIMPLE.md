# Inventory Allocation Logic ("Ship Now") Explained in Simple Words

---

## 🎯 What is Inventory Allocation?
When you have boxes of stock sitting in your **central warehouse (Locad)**, the system answers one simple question:

> **"How many boxes should we send to Amazon FBA, how many to Noon FBN, and how many to Noon Minutes?"**

The system makes this decision in **4 simple steps**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                      THE 4-STEP ALLOCATION PROCESS                     │
└────────────────────────────────────────────────────────────────────────┘
  STEP 1: Check Channel Status   ──▶ Is the channel turned ON or OFF?
               │
  STEP 2: Calculate Channel Need ──▶ How many boxes does each channel need?
               │
  STEP 3: Rank by Sales Speed    ──▶ Who sells fastest gets 1st Priority!
               │
  STEP 4: Distribute the Boxes   ──▶ Fill Rank 1 first, then Rank 2, then Rank 3
```

---

## Step 1: Check Channel Status (Active vs Inactive)
Before allocating anything, the system checks the SKU Master settings:
* If **Amazon Active = OFF** $\rightarrow$ Amazon gets **0 boxes**.
* If **Noon Active = OFF** $\rightarrow$ Noon gets **0 boxes**.
* If **Minutes Active = OFF** $\rightarrow$ Minutes gets **0 boxes**.
* Only channels turned **ON** are eligible to receive stock.

---

## Step 2: Calculate How Many Boxes Each Channel Asks For
Each active channel calculates its **30-day requirement**:

$$\text{30-Day Sales Demand} = \text{Daily Sales Speed} \times 30\text{ Days}$$
$$\text{Units Needed} = \text{30-Day Sales Demand} - \text{Current Stock in that Channel}$$
$$\text{Boxes Needed} = \text{Units Needed} \div \text{Units per Box (Rounded UP to full boxes)}$$

### 🌟 The 2 Special Rules:
1. **The "Seed Box" Rule (New / Zero Sales Channel):**
   * If a channel has **0 stock** and **0 sales**, it asks for **1 test box** so you can start selling on that marketplace.
2. **The "Keep-in-Stock" Rule (Active Channel with Low Stock):**
   * If a channel has active daily sales and less than 1 full box of stock, it will **always ask for at least 1 full box** to prevent going out of stock.

---

## Step 3: Priority Ranking (Who Gets Stock First?)
The system looks at **daily sales speed** across the channels and ranks them:

* 🥇 **Rank 1 (Top Priority):** The channel selling the fastest.
* 🥈 **Rank 2 (Second Priority):** The channel with the second highest sales.
* 🥉 **Rank 3 (Third Priority):** The channel with the lowest or zero sales.

*(If two channels have the same sales, the system breaks ties alphabetically: Amazon > Minutes > Noon).*

---

## Step 4: Distribute Warehouse Boxes (The Waterfall Rule)
The system looks at the **total boxes available in Locad warehouse** and distributes them in order of priority:

1. **Rank 1 (Fastest Seller)** takes all the boxes it needs (up to what is available in the warehouse).
2. **Rank 2 (Next Seller)** gets whatever boxes are left over.
3. **Rank 3 (Lowest Seller)** gets whatever is left after Rank 1 and Rank 2 take their share.

---

# 📦 Real-World Examples

---

### Example 1: Normal Allocation (Plenty of Stock)
* **In Locad Warehouse**: **4 boxes** available (Box size = 25 units).
* **Amazon**: Sells 2.0/day $\rightarrow$ Needs 60 units = **3 boxes** (Fastest $\rightarrow$ **Rank 1**)
* **Noon**: Sells 0.5/day $\rightarrow$ Needs 15 units = **1 box** (Second $\rightarrow$ **Rank 2**)

#### How boxes are distributed:
1. **Rank 1 (Amazon)** takes its **3 boxes** $\rightarrow$ *(1 box remaining in Locad)*.
2. **Rank 2 (Noon)** takes the remaining **1 box** $\rightarrow$ *(0 boxes remaining)*.

✅ **Result**: Send **3 boxes to Amazon**, send **1 box to Noon**.

---

### Example 2: Limited Stock (Scarcity / High Demand)
* **In Locad Warehouse**: Only **2 boxes** available.
* **Amazon**: Sells 2.0/day $\rightarrow$ Needs **3 boxes** (Fastest $\rightarrow$ **Rank 1**)
* **Noon**: Sells 0.5/day $\rightarrow$ Needs **1 box** (Second $\rightarrow$ **Rank 2**)

#### How boxes are distributed:
1. **Rank 1 (Amazon)** asks for 3 boxes, but only 2 exist $\rightarrow$ Takes **all 2 boxes**.
2. **Rank 2 (Noon)** asks for 1 box, but warehouse is now empty $\rightarrow$ Gets **0 boxes**.

✅ **Result**: Send **2 boxes to Amazon**, send **0 boxes to Noon**.  
*(Your highest-selling channel gets protected first!)*

---

### Example 3: Launching on a New Channel (Seed Box Rule)
* **In Locad Warehouse**: **2 boxes** available.
* **Amazon**: Sells 1.0/day $\rightarrow$ Needs **1 box** (Fastest $\rightarrow$ **Rank 1**)
* **Noon**: 0 units in stock, 0 sales yet $\rightarrow$ Requests **1 Seed Box** (**Rank 2**)

#### How boxes are distributed:
1. **Rank 1 (Amazon)** takes its **1 box** $\rightarrow$ *(1 box remaining)*.
2. **Rank 2 (Noon)** takes the remaining **1 seed box** $\rightarrow$ *(0 boxes remaining)*.

✅ **Result**: Send **1 box to Amazon**, send **1 box to Noon**.

---

### Example 4: Channel Turned OFF
* **In Locad Warehouse**: **2 boxes** available.
* **Amazon Active**: `ON` $\rightarrow$ Needs **1 box** (**Rank 1**)
* **Noon Active**: `OFF` (Inactive in SKU Master) $\rightarrow$ Needs **0 boxes**
* **Minutes Active**: `OFF` $\rightarrow$ Needs **0 boxes**

#### How boxes are distributed:
1. **Amazon** takes **1 box**.
2. **Noon** and **Minutes** get **0 boxes** because they are disabled.
3. Remaining **1 box stays in Locad warehouse**.

✅ **Result**: Send **1 box to Amazon**, **0 to Noon**, **0 to Minutes**.

---

## 📊 Summary Cheat Sheet

| Situation | What the System Does |
| :--- | :--- |
| **Channel is Inactive (`OFF`)** | Allocates **0 boxes**. |
| **0 Stock & 0 Sales** | Allocates **1 test seed box** (if warehouse has stock). |
| **Channel has Sales** | Allocates enough boxes for **30 days of coverage**. |
| **Not enough boxes in warehouse** | **Highest sales channel gets stock first**; slower channels wait for the next batch. |
| **Carton packaging rule** | Always allocates in **full sealed boxes** (never breaks open boxes into loose units). |

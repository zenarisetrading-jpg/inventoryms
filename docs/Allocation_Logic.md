# Inventory Allocation Logic

This document explains the simple rules the system uses to decide how many boxes of inventory to send from the main warehouse (Locad) to Amazon (FBA) and Noon (FBN).

## The Core Rule: 30-Day Coverage
The main goal of the system is to ensure both Amazon and Noon have enough stock to last for **30 days**, based on their recent sales speed. Because you ship products in full boxes, the system will always round up. This means if you need stock, it will send enough full boxes to give you **slightly more** than 30 days of coverage to be safe.

---

## How It Makes Decisions

### 1. Amazon Always Gets Priority
When the system looks at the boxes available in Locad, it will **always give boxes to Amazon first**. Noon will only get the boxes that are left over after Amazon's needs are met.

### 2. Checking the Current Coverage
For both Amazon and Noon, the system checks:
> *"Do you already have enough stock to last 30 days?"*

- **If YES (30 days or more):** The system says "You are fine!" and will send **0 boxes**. No allocation happens.
- **If NO (less than 30 days):** The system figures out exactly how many units you are short. It then calculates how many full boxes are needed to cover that shortage. It will take those boxes from Locad to guarantee you get back over the 30-day safety net.

### 3. The "Zero Stock, Zero Sales" Rule (1-Box Fallback)
If a product has **0 units** currently in stock and **0 sales** (meaning its coverage is practically zero), the system will automatically try to jumpstart it. 
- It will demand **exactly 1 box** to be sent to the platform. 
- If Locad has at least 1 box available, it will be sent.

### 4. The "Low Stock, Active Sales" Rule (Minimum 1-Box)
If a product has **active sales** but its physical unit count drops below the size of **1 full box** (e.g., you have 10 units left but a box holds 50):
- The system will ensure that **at least 1 box** is demanded, regardless of how small the actual 30-day shortfall might mathematically be.
- This prevents scenarios where the system might otherwise round down to 0 if the math deemed the tiny remnant of stock was "just barely enough" for 30 days.
---

## Common Scenarios

Here is how the system handles different situations in plain English:

**Scenario A: Both platforms are healthy.**
- Amazon has 40 days of stock. Noon has 35 days of stock.
- **Action:** The system sends 0 boxes to both. Locad keeps all its stock.

**Scenario B: Amazon is running low, Noon is healthy.**
- Amazon has 10 days of stock left. Noon has 40 days of stock left.
- **Action:** The system calculates how many boxes Amazon needs to get back past 30 days. It sends those boxes to Amazon. It sends 0 boxes to Noon.

**Scenario C: Both are running low, and Locad has plenty of stock.**
- Amazon has 10 days of stock. Noon has 5 days of stock. Locad has 100 boxes.
- **Action:** The system calculates Amazon needs 2 boxes and Noon needs 3 boxes. Because Locad has plenty, Amazon gets its 2 boxes, and Noon gets its 3 boxes.

**Scenario D: Both are running low, but Locad is almost empty.**
- Amazon needs 4 boxes to reach 30 days. Noon needs 3 boxes to reach 30 days.
- Locad only has 5 boxes total.
- **Action:** Because Amazon gets priority, the system gives Amazon the 4 boxes it needs. Locad only has 1 box left. The system gives that 1 remaining box to Noon. Noon doesn't get everything it needs, but Amazon is fully protected.

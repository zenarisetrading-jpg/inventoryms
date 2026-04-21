# Decision Engine

## Coverage Engine
CoverageDays = UnitsAvailable / BlendedSV

## Category Rules
A: 60 days min, reorder <45
B: 45 days min, reorder <30
C: 20 days min, reorder <20 or MOQ

## Allocation Engine
Amazon priority, whole boxes only, remainder to Noon.

## Reorder Engine
Trigger when ProjectedCoverage < Threshold AND Incoming insufficient.

## Transfer Engine
Recommend transfers when one node has excess and another deficit.

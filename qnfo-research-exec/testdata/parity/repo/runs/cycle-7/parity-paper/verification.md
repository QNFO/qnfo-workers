# Verification report

## Script
```python
import math
N = 1e80
m = 1.67e-27
c = 3.00e8
E = N * m * c * c
print("CLAIM Q1: computed=%.1e expected=1.5e70 match=%s" % (E, "yes" if abs(E - 1.5e70) / 1.5e70 < 0.01 else "no"))
```

## Execution output
```
CLAIM Q1: computed=1.5e+70 expected=1.5e70 match=yes

[exit 0]
```

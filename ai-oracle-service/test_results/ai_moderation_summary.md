# AI Moderation Test Summary

Aggregator URL: `https://ai-oracle.internalbuildtools.online/moderate/report`

Relayer address used for signing: `0x8B3d8A21B794544759EA04B15F2bAc1e61877A11`

| Test ID | Name | Expected HTTP | Actual HTTP | Expected Decision | Actual Decision | Status | Client Time (ms) | Server Time (ms) |
|---|---|---:|---:|---|---|---|---:|---:|
| AI-S01 | Valid civic text report - road damage | 200 | 200 | ACCEPT | ACCEPT | PASSED | 1894.95 | 251.85 |
| AI-S02 | Valid civic text report - waste management | 200 | 200 | ACCEPT | ACCEPT | PASSED | 1725.39 | 170.77 |
| AI-S03 | Spam promotional text | 200 | 200 | REJECT | REJECT | PASSED | 1619.36 | 172.99 |
| AI-S04 | Threatening text | 200 | 200 | REJECT | ACCEPT | FAILED | 1660.09 | 168.44 |
| AI-S05 | Non-civic irrelevant text | 200 | 200 | REJECT | ACCEPT | FAILED | 1814.58 | 146.05 |
| AI-S06 | Empty report text | 400 | 400 | None | None | PASSED | 696.65 | None |
| AI-S07 | Valid civic text with safe pothole image | 200 | 200 | ACCEPT | ACCEPT | PASSED | 1418.83 | 510.72 |
| AI-S08 | Valid civic text with safe garbage image | 200 | 200 | ACCEPT | ACCEPT | PASSED | 3154.51 | 533.82 |
| AI-S09 | Valid civic text with unsafe image | 200 | 200 | REJECT | REJECT | PASSED | 2100.04 | 483.98 |
| AI-S10 | Corrupted image file | 200 | SKIPPED | REJECT | SKIPPED | FAILED |  |  |
| AI-SEC-01 | Missing API key | 401 | 401 | None | None | PASSED | 725.55 | None |
| AI-SEC-02 | Wrong API key | 401 | 401 | None | None | PASSED | 833.58 | None |
| AI-SEC-03 | Invalid relayer signature | 401 | 401 | None | None | PASSED | 690.18 | None |
| AI-SEC-04 | Expired timestamp | 401 | 401 | None | None | PASSED | 1548.88 | None |
| AI-SEC-05A | Replay test first request | 200 | 200 | ACCEPT | ACCEPT | PASSED | 1700.42 | 153.4 |
| AI-SEC-05B | Replay test second request with same nonce | 401 | 401 | None | None | PASSED | 1633.33 | None |
| AI-VAL-01 | Missing relayer signature | 401 | 401 | None | None | PASSED | 1587.9 | None |
| AI-VAL-02 | Missing request timestamp | 401 | 401 | None | None | PASSED | 716.03 | None |
| AI-VAL-03 | Missing request nonce | 401 | 401 | None | None | PASSED | 721.28 | None |
| AI-VAL-04 | Invalid timestamp format | 400 | 400 | None | None | PASSED | 695.81 | None |
| AI-VAL-05 | Future timestamp beyond max age | 401 | 401 | None | None | PASSED | 684.82 | None |
| AI-VAL-06 | Invalid metadata JSON | 400 | 400 | None | None | PASSED | 743.88 | None |
| AI-VAL-07 | Missing report_id | 400 | 400 | None | None | PASSED | 687.29 | None |
| AI-VAL-08 | Missing payload_hash | 400 | 400 | None | None | PASSED | 663.45 | None |
| AI-VAL-09 | Whitespace-only text | 400 | 400 | None | None | PASSED | 747.05 | None |
| AI-VAL-10 | Too many files | 400 | 400 | None | None | PASSED | 1465.74 | None |
| AI-VAL-11 | Unsupported file MIME type | 400 | 400 | None | None | PASSED | 704.9 | None |
| AI-VAL-12 | Oversized file | 400 | 400 | None | None | PASSED | 7336.38 | None |

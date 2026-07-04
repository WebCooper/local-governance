# AI Moderation Test Summary

Aggregator URL: `http://localhost:8000/moderate/report`

Relayer address used for signing: `0x8B3d8A21B794544759EA04B15F2bAc1e61877A11`

| Test ID | Name | Expected HTTP | Actual HTTP | Expected Decision | Actual Decision | Status | Client Time (ms) | Server Time (ms) |
|---|---|---:|---:|---|---|---|---:|---:|
| AI-S01 | Valid civic text report - road damage | 200 | 200 | ACCEPT | ACCEPT | PASSED | 78.76 | 69.62 |
| AI-S02 | Valid civic text report - waste management | 200 | 200 | ACCEPT | ACCEPT | PASSED | 41.99 | 37.59 |
| AI-S03 | Spam promotional text | 200 | 200 | REJECT | REJECT | PASSED | 39.16 | 34.93 |
| AI-S04 | Threatening text | 200 | 200 | REJECT | REJECT | PASSED | 39.82 | 36.16 |
| AI-S05 | Non-civic irrelevant text | 200 | 200 | REJECT | ACCEPT | FAILED | 40.03 | 36.76 |
| AI-S06 | Empty report text | 400 | 400 | None | None | PASSED | 3.51 | None |
| AI-S07 | Valid civic text with safe pothole image | 200 | 200 | ACCEPT | ACCEPT | PASSED | 87.67 | 80.66 |
| AI-S08 | Valid civic text with safe garbage image | 200 | 200 | ACCEPT | ACCEPT | PASSED | 48.57 | 43.74 |
| AI-S09 | Valid civic text with unsafe image | 200 | SKIPPED | REJECT | SKIPPED | FAILED |  |  |
| AI-S10 | Corrupted image file | 200 | SKIPPED | REJECT | SKIPPED | FAILED |  |  |
| AI-S11 | Valid civic text with student face image (should blur) | 200 | 200 | ACCEPT | ACCEPT | FAILED | 95.76 | 89.43 |
| AI-SEC-01 | Missing API key | 401 | 401 | None | None | PASSED | 2.99 | None |
| AI-SEC-02 | Wrong API key | 401 | 401 | None | None | PASSED | 3.03 | None |
| AI-SEC-03 | Invalid relayer signature | 401 | 401 | None | None | PASSED | 12.12 | None |
| AI-SEC-04 | Expired timestamp | 401 | 401 | None | None | PASSED | 3.27 | None |
| AI-SEC-05A | Replay test first request | 200 | 200 | ACCEPT | ACCEPT | PASSED | 38.06 | 33.93 |
| AI-SEC-05B | Replay test second request with same nonce | 401 | 401 | None | None | PASSED | 11.9 | None |
| AI-VAL-01 | Missing relayer signature | 401 | 401 | None | None | PASSED | 3.57 | None |
| AI-VAL-02 | Missing request timestamp | 401 | 401 | None | None | PASSED | 4.3 | None |
| AI-VAL-03 | Missing request nonce | 401 | 401 | None | None | PASSED | 3.3 | None |
| AI-VAL-04 | Invalid timestamp format | 400 | 400 | None | None | PASSED | 3.7 | None |
| AI-VAL-05 | Future timestamp beyond max age | 401 | 401 | None | None | PASSED | 3.66 | None |
| AI-VAL-06 | Invalid metadata JSON | 400 | 400 | None | None | PASSED | 3.15 | None |
| AI-VAL-07 | Missing report_id | 400 | 400 | None | None | PASSED | 3.02 | None |
| AI-VAL-08 | Missing payload_hash | 400 | 400 | None | None | PASSED | 2.87 | None |
| AI-VAL-09 | Whitespace-only text | 400 | 400 | None | None | PASSED | 3.13 | None |
| AI-VAL-10 | Too many files | 400 | 400 | None | None | PASSED | 3.77 | None |
| AI-VAL-11 | Unsupported file MIME type | 400 | 400 | None | None | PASSED | 3.5 | None |
| AI-VAL-12 | Oversized file | 400 | 400 | None | None | PASSED | 48.95 | None |

# AI Moderation Test Summary

Aggregator URL: `http://localhost:8000/moderate/report`

Relayer address used for signing: `0x8B3d8A21B794544759EA04B15F2bAc1e61877A11`

| Test ID | Name | Expected HTTP | Actual HTTP | Expected Decision | Actual Decision | Status | Client Time (ms) | Server Time (ms) |
|---|---|---:|---:|---|---|---|---:|---:|
| AI-S01 | Valid civic text report - road damage | 200 | 401 | ACCEPT | None | FAILED | 74.91 | None |
| AI-S02 | Valid civic text report - waste management | 200 | 401 | ACCEPT | None | FAILED | 11.8 | None |
| AI-S03 | Spam promotional text | 200 | 401 | REJECT | None | FAILED | 11.26 | None |
| AI-S04 | Threatening text | 200 | 401 | REJECT | None | FAILED | 13.17 | None |
| AI-S05 | Non-civic irrelevant text | 200 | 401 | REJECT | None | FAILED | 14.0 | None |
| AI-S06 | Empty report text | 400 | 400 | None | None | PASSED | 3.88 | None |
| AI-S07 | Valid civic text with safe pothole image | 200 | 401 | ACCEPT | None | FAILED | 24.27 | None |
| AI-S08 | Valid civic text with safe garbage image | 200 | 401 | ACCEPT | None | FAILED | 13.88 | None |
| AI-S09 | Valid civic text with unsafe image | 200 | SKIPPED | REJECT | SKIPPED | FAILED |  |  |
| AI-S10 | Corrupted image file | 200 | SKIPPED | REJECT | SKIPPED | FAILED |  |  |
| AI-S11 | Valid civic text with student face image (should blur) | 200 | 401 | ACCEPT | None | FAILED | 19.35 | None |
| AI-SEC-01 | Missing API key | 401 | 401 | None | None | PASSED | 3.93 | None |
| AI-SEC-02 | Wrong API key | 401 | 401 | None | None | PASSED | 3.75 | None |
| AI-SEC-03 | Invalid relayer signature | 401 | 401 | None | None | PASSED | 13.07 | None |
| AI-SEC-04 | Expired timestamp | 401 | 401 | None | None | PASSED | 3.78 | None |
| AI-SEC-05A | Replay test first request | 200 | 401 | ACCEPT | None | FAILED | 12.65 | None |
| AI-SEC-05B | Replay test second request with same nonce | 401 | 401 | None | None | PASSED | 11.84 | None |
| AI-VAL-01 | Missing relayer signature | 401 | 401 | None | None | PASSED | 3.56 | None |
| AI-VAL-02 | Missing request timestamp | 401 | 401 | None | None | PASSED | 4.18 | None |
| AI-VAL-03 | Missing request nonce | 401 | 401 | None | None | PASSED | 4.34 | None |
| AI-VAL-04 | Invalid timestamp format | 400 | 400 | None | None | PASSED | 3.72 | None |
| AI-VAL-05 | Future timestamp beyond max age | 401 | 401 | None | None | PASSED | 4.2 | None |
| AI-VAL-06 | Invalid metadata JSON | 400 | 400 | None | None | PASSED | 4.2 | None |
| AI-VAL-07 | Missing report_id | 400 | 400 | None | None | PASSED | 4.07 | None |
| AI-VAL-08 | Missing payload_hash | 400 | 400 | None | None | PASSED | 3.95 | None |
| AI-VAL-09 | Whitespace-only text | 400 | 400 | None | None | PASSED | 3.49 | None |
| AI-VAL-10 | Too many files | 400 | 400 | None | None | PASSED | 4.01 | None |
| AI-VAL-11 | Unsupported file MIME type | 400 | 400 | None | None | PASSED | 4.02 | None |
| AI-VAL-12 | Oversized file | 400 | 400 | None | None | PASSED | 93.72 | None |

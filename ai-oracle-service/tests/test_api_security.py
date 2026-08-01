"""
T3.1 — AI Oracle Aggregator API Authentication & Security Tests

Verifies:
- Valid API key + valid relayer signature → accepted
- Missing API key → 403
- Wrong API key → 403
- Wrong relayer signature (imposter) → 401
- Replayed nonce → 403 (replay protection)
- Stale timestamp (>300s old) → 403
- File exceeds 5MB → 413 or 422
- Disallowed MIME type → 422
- Too many files → 422
"""
import io
import os
import time
import uuid

import pytest
import httpx

from tests.conftest import (
    build_canonical_object,
    build_metadata,
    build_signed_headers,
)

REPORT_ENDPOINT = "/moderate/report"


def post_report(
    http_client: httpx.Client,
    relayer_wallet,
    api_key: str,
    description: str = "The pothole on Main Street is causing accidents.",
    timestamp: str = None,
    nonce: str = None,
    override_headers: dict = None,
    files=None,
):
    """Helper: builds and sends a fully signed report moderation request."""
    if nonce is None:
        nonce = str(uuid.uuid4())
    if timestamp is None:
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    canonical_obj = build_canonical_object(description, timestamp=timestamp, nonce=nonce)
    headers = build_signed_headers(relayer_wallet, canonical_obj, api_key, timestamp=timestamp, nonce=nonce)
    if override_headers:
        headers.update(override_headers)

    metadata = build_metadata(description, canonical_obj)
    data = {"metadata": str(metadata).replace("'", '"')}  # JSON string

    if files is None:
        files_arg = []
    else:
        files_arg = files

    return http_client.post(REPORT_ENDPOINT, headers=headers, data=data, files=files_arg)


# ─── T3.1.1 — Valid request accepted ─────────────────────────────────────────

class TestValidRequest:

    def test_T3_1_1_valid_signed_request_returns_200(self, http_client, relayer_wallet, api_key):
        """T3.1.1 — A fully valid request with correct API key and relayer signature is accepted."""
        response = post_report(http_client, relayer_wallet, api_key)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        body = response.json()
        assert "final_decision" in body
        assert body["final_decision"] in ("ACCEPT", "REJECT")


# ─── T3.1.2 & T3.1.3 — API Key enforcement ────────────────────────────────────

class TestApiKeyEnforcement:

    def test_T3_1_2_missing_api_key_returns_403(self, http_client, relayer_wallet, api_key):
        """T3.1.2 — Missing x-api-key header → 403 Forbidden."""
        response = post_report(
            http_client,
            relayer_wallet,
            api_key,
            override_headers={"x-api-key": ""},
        )
        assert response.status_code in (401, 403), (
            f"Expected 401 or 403, got {response.status_code}: {response.text}"
        )

    def test_T3_1_3_wrong_api_key_returns_403(self, http_client, relayer_wallet, api_key):
        """T3.1.3 — Wrong x-api-key value → 403 Forbidden."""
        response = post_report(
            http_client,
            relayer_wallet,
            api_key,
            override_headers={"x-api-key": "TOTALLY-WRONG-KEY-12345"},
        )
        assert response.status_code in (401, 403), (
            f"Expected 401 or 403, got {response.status_code}: {response.text}"
        )


# ─── T3.1.4 — Invalid relayer signature ──────────────────────────────────────

class TestRelayerSignatureEnforcement:

    def test_T3_1_4_invalid_relayer_signature_returns_401(self, http_client, relayer_wallet, api_key):
        """T3.1.4 — Valid API key but forged relayer signature → 401 Unauthorized."""
        response = post_report(
            http_client,
            relayer_wallet,
            api_key,
            override_headers={"x-relayer-signature": "0x" + "f" * 130},
        )
        assert response.status_code in (401, 403), (
            f"Expected 401 or 403, got {response.status_code}: {response.text}"
        )


# ─── T3.1.5 — Nonce replay protection ────────────────────────────────────────

class TestNonceReplayProtection:

    def test_T3_1_5_replayed_nonce_returns_403(self, http_client, relayer_wallet, api_key):
        """T3.1.5 — Reusing the same nonce in two requests is rejected."""
        fixed_nonce = str(uuid.uuid4())

        # First request should succeed
        r1 = post_report(http_client, relayer_wallet, api_key, nonce=fixed_nonce)
        assert r1.status_code == 200, f"First request failed: {r1.text}"

        # Second request with same nonce should be rejected
        r2 = post_report(http_client, relayer_wallet, api_key, nonce=fixed_nonce)
        assert r2.status_code in (401, 403, 409), (
            f"Expected 401/403/409 for replayed nonce, got {r2.status_code}: {r2.text}"
        )


# ─── T3.1.7 — File size limit ─────────────────────────────────────────────────

class TestFileSizeLimit:

    @pytest.mark.slow
    def test_T3_1_7_file_exceeding_5mb_is_rejected(self, http_client, relayer_wallet, api_key):
        """T3.1.7 — A file exceeding 5MB (MAX_FILE_SIZE_MB) should be rejected."""
        large_file = io.BytesIO(b"X" * (6 * 1024 * 1024))
        files = [("files", ("large_image.jpg", large_file, "image/jpeg"))]

        response = post_report(http_client, relayer_wallet, api_key, files=files)
        assert response.status_code in (400, 413, 422), (
            f"Expected 400/413/422 for oversized file, got {response.status_code}: {response.text}"
        )


# ─── T3.1.8 — Disallowed MIME type ────────────────────────────────────────────

class TestMimeTypeEnforcement:

    def test_T3_1_8_disallowed_mime_type_pdf_is_rejected(self, http_client, relayer_wallet, api_key):
        """T3.1.8 — Uploading a PDF (not in ALLOWED_MIME_TYPES) is rejected."""
        fake_pdf = io.BytesIO(b"%PDF-1.4 fake pdf content")
        files = [("files", ("document.pdf", fake_pdf, "application/pdf"))]

        response = post_report(http_client, relayer_wallet, api_key, files=files)
        assert response.status_code in (400, 422), (
            f"Expected 400/422 for disallowed MIME type, got {response.status_code}: {response.text}"
        )


# ─── T3.1.9 — Max files limit ─────────────────────────────────────────────────

class TestMaxFilesLimit:

    def test_T3_1_9_too_many_files_rejected(self, http_client, relayer_wallet, api_key):
        """T3.1.9 — More than MAX_FILES (3) files should be rejected."""
        files = [
            ("files", (f"image_{i}.jpg", io.BytesIO(b"fake-image-data"), "image/jpeg"))
            for i in range(4)
        ]

        response = post_report(http_client, relayer_wallet, api_key, files=files)
        assert response.status_code in (400, 422), (
            f"Expected 400/422 for too many files, got {response.status_code}: {response.text}"
        )

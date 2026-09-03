"""
T3.2 — AI Oracle Classification Accuracy Tests
T3.3 — Oracle Aggregator Voting Validation Tests
T3.4 — Response Auditability Tests

These tests verify the semantic decisions made by the oracle pipeline.
"""
import io
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
POLL_ENDPOINT = "/moderate/poll"


def post_report_text(
    http_client: httpx.Client,
    relayer_wallet,
    api_key: str,
    description: str,
) -> httpx.Response:
    """Send a text-only report moderation request."""
    nonce = str(uuid.uuid4())
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    canonical_obj = build_canonical_object(description, timestamp=timestamp, nonce=nonce)
    headers = build_signed_headers(relayer_wallet, canonical_obj, api_key, timestamp=timestamp, nonce=nonce)
    metadata = build_metadata(description, canonical_obj)

    import json
    return http_client.post(
        REPORT_ENDPOINT,
        headers=headers,
        data={"metadata": json.dumps(metadata)},
        files=[],
    )


def post_poll(
    http_client: httpx.Client,
    relayer_wallet,
    api_key: str,
    title: str,
    description: str,
) -> httpx.Response:
    """Send a poll moderation request."""
    import hashlib
    import json
    nonce = str(uuid.uuid4())
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    combined = f"Title: {title}\n\nDescription: {description}"
    text_hash = hashlib.sha256(combined.encode()).hexdigest()

    canonical_obj = {
        "report_id": "",
        "text_hash": text_hash,
        "media_hashes": [],
        "category": "Official Poll",
        "location": "Central",
        "ticket_hash": "0",
        "payload_hash": text_hash,
        "timestamp": timestamp,
        "nonce": nonce,
    }
    headers = build_signed_headers(relayer_wallet, canonical_obj, api_key, timestamp=timestamp, nonce=nonce)

    payload = json.dumps({
        "title": title,
        "description": description,
        **canonical_obj,
    })

    return http_client.post(
        POLL_ENDPOINT,
        headers={**headers, "Content-Type": "application/json"},
        content=payload,
    )


# ─── T3.2 — Classification Accuracy ──────────────────────────────────────────

class TestClassificationAccuracy:
    """
    T3.2 — Tests that the aggregator pipeline correctly classifies report content.
    These are LIVE tests against the running oracle services.
    """

    def test_T3_2_1_safe_civic_report_is_accepted(self, http_client, relayer_wallet, api_key):
        """T3.2.1 — A genuine civic complaint is ACCEPTED."""
        description = (
            "There is a large pothole at the intersection of Oak Street and 5th Avenue. "
            "It is causing damage to vehicles and is a safety hazard for cyclists."
        )
        response = post_report_text(http_client, relayer_wallet, api_key, description)
        assert response.status_code == 200
        body = response.json()
        assert body.get("final_decision") == "ACCEPT", (
            f"Expected ACCEPT for civic report. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )

    def test_T3_2_2_hate_speech_is_rejected(self, http_client, relayer_wallet, api_key):
        """T3.2.2 — Hateful/discriminatory content is REJECTED by the safety oracle."""
        description = (
            "I hate all people from that neighborhood. They are all criminals and "
            "should be forced out. This is not a real complaint."
        )
        response = post_report_text(http_client, relayer_wallet, api_key, description)
        assert response.status_code == 200
        body = response.json()
        assert body.get("final_decision") == "REJECT", (
            f"Expected REJECT for hate speech. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )

    def test_T3_2_3_spam_commercial_is_rejected(self, http_client, relayer_wallet, api_key):
        """T3.2.3 — Commercial spam is REJECTED by the spam oracle."""
        description = (
            "BUY NOW! BEST CRYPTO INVESTMENT! 100x returns guaranteed! "
            "Click this link to get rich! Limited time offer! Not civic at all!"
        )
        response = post_report_text(http_client, relayer_wallet, api_key, description)
        assert response.status_code == 200
        body = response.json()
        assert body.get("final_decision") == "REJECT", (
            f"Expected REJECT for spam. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )

    def test_T3_2_4_non_civic_content_is_rejected(self, http_client, relayer_wallet, api_key):
        """T3.2.4 — Content completely unrelated to civic governance is REJECTED."""
        description = (
            "My favorite movie is great. I love watching sports on TV. "
            "The weather is nice today. This is my personal blog entry."
        )
        response = post_report_text(http_client, relayer_wallet, api_key, description)
        assert response.status_code == 200
        body = response.json()
        assert body.get("final_decision") == "REJECT", (
            f"Expected REJECT for non-civic content. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )

    def test_T3_2_5_emergency_civic_is_accepted(self, http_client, relayer_wallet, api_key):
        """T3.2.5 — Genuine emergency civic report is ACCEPTED."""
        description = (
            "URGENT: There is a gas leak at 123 Municipal Road. "
            "Residents are evacuating. The fire department has been called but "
            "local infrastructure management needs to be notified immediately."
        )
        response = post_report_text(http_client, relayer_wallet, api_key, description)
        assert response.status_code == 200
        body = response.json()
        assert body.get("final_decision") == "ACCEPT", (
            f"Expected ACCEPT for emergency civic. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )

    def test_T3_2_5b_university_facility_infrastructure_is_accepted(self, http_client, relayer_wallet, api_key):
        """T3.2.5b — University facility and gym equipment infrastructure report is ACCEPTED."""
        description = (
            "The equipments in the university gym are broken, not safe to use. "
            "The items are corroded and very dangerous."
        )
        response = post_report_text(http_client, relayer_wallet, api_key, description)
        assert response.status_code == 200
        body = response.json()
        assert body.get("final_decision") == "ACCEPT", (
            f"Expected ACCEPT for university gym damage report. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )



# ─── T3.4 — Response Auditability ─────────────────────────────────────────────

class TestResponseAuditability:
    """
    T3.4 — Verifies that every response contains the required audit fields.
    """

    def test_T3_4_1_response_includes_summary_explanation(self, http_client, relayer_wallet, api_key):
        """T3.4.1 — Response always includes a non-empty 'summary_explanation'."""
        description = "There is broken street lighting on Park Avenue."
        response = post_report_text(http_client, relayer_wallet, api_key, description)
        assert response.status_code == 200
        body = response.json()
        assert "summary_explanation" in body, "Response missing 'summary_explanation'"
        assert isinstance(body["summary_explanation"], str)
        assert len(body["summary_explanation"]) > 0

    def test_T3_4_2_response_includes_final_decision(self, http_client, relayer_wallet, api_key):
        """T3.4.2 — Response always includes 'final_decision' as ACCEPT or REJECT."""
        description = "The public park benches are broken and need replacement."
        response = post_report_text(http_client, relayer_wallet, api_key, description)
        assert response.status_code == 200
        body = response.json()
        assert "final_decision" in body, "Response missing 'final_decision'"
        assert body["final_decision"] in ("ACCEPT", "REJECT"), (
            f"Invalid final_decision value: {body['final_decision']}"
        )

    def test_T3_4_3_response_structure_is_consistent(self, http_client, relayer_wallet, api_key):
        """T3.4.3 — Response structure is consistent across multiple calls."""
        description = "Streetlight malfunction at Central Park entrance."
        for _ in range(3):
            response = post_report_text(http_client, relayer_wallet, api_key, description)
            assert response.status_code == 200
            body = response.json()
            assert "final_decision" in body
            assert "summary_explanation" in body


# ─── T3.3 — Oracle Voting Aggregation (via poll endpoint) ─────────────────────

class TestOracleVotingAggregation:
    """
    T3.3 — Verifies the aggregator's majority voting logic.
    These tests use the /moderate/poll endpoint which also goes through the aggregator.
    """

    def test_T3_3_1_valid_civic_poll_is_accepted(self, http_client, relayer_wallet, api_key):
        """T3.3.1 — A legitimate governance poll is ACCEPTED by the aggregator."""
        import hashlib, json

        title = "Should the city install more bike lanes?"
        description = (
            "This poll asks residents whether they support the expansion of bicycle "
            "infrastructure in the downtown area to reduce traffic congestion and "
            "improve sustainable transportation options."
        )

        nonce = str(uuid.uuid4())
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        combined = f"Title: {title}\n\nDescription: {description}"
        text_hash = hashlib.sha256(combined.encode()).hexdigest()

        canonical_obj = {
            "report_id": "",
            "text_hash": text_hash,
            "media_hashes": [],
            "category": "Official Poll",
            "location": "Central",
            "ticket_hash": "0",
            "payload_hash": text_hash,
            "timestamp": timestamp,
            "nonce": nonce,
        }
        headers = build_signed_headers(relayer_wallet, canonical_obj, api_key, timestamp=timestamp, nonce=nonce)

        payload = json.dumps({
            "title": title,
            "description": description,
            **canonical_obj,
        })

        response = http_client.post(
            POLL_ENDPOINT,
            headers={**headers, "Content-Type": "application/json"},
            content=payload,
        )

        assert response.status_code == 200
        body = response.json()
        assert "final_decision" in body
        assert body["final_decision"] == "ACCEPT", (
            f"Expected ACCEPT for civic poll. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )

    def test_T3_3_2_inappropriate_poll_is_rejected(self, http_client, relayer_wallet, api_key):
        """T3.3.2 — An inappropriate or non-civic poll is REJECTED."""
        import hashlib, json

        title = "Best cryptocurrency to invest in right now?"
        description = (
            "Vote for the best crypto: Bitcoin, Ethereum, or Dogecoin. "
            "Not related to local governance at all. Pure financial speculation."
        )

        nonce = str(uuid.uuid4())
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        combined = f"Title: {title}\n\nDescription: {description}"
        text_hash = hashlib.sha256(combined.encode()).hexdigest()

        canonical_obj = {
            "report_id": "",
            "text_hash": text_hash,
            "media_hashes": [],
            "category": "Official Poll",
            "location": "Central",
            "ticket_hash": "0",
            "payload_hash": text_hash,
            "timestamp": timestamp,
            "nonce": nonce,
        }
        headers = build_signed_headers(relayer_wallet, canonical_obj, api_key, timestamp=timestamp, nonce=nonce)

        payload = json.dumps({
            "title": title,
            "description": description,
            **canonical_obj,
        })

        response = http_client.post(
            POLL_ENDPOINT,
            headers={**headers, "Content-Type": "application/json"},
            content=payload,
        )

        assert response.status_code == 200
        body = response.json()
        assert body.get("final_decision") == "REJECT", (
            f"Expected REJECT for non-civic poll. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )


# ─── T3.2.6 & T3.2.7 — Media Moderation & Image Safety Tests ─────────────────

def get_test_image_bytes(filename: str, fallback_color=(73, 109, 137), size=(100, 100)) -> bytes:
    """
    Returns image bytes from tests/fixtures/<filename> (or .jpg / .jpeg equivalent) if present,
    otherwise generates a valid PNG image in memory via PIL.
    """
    import os

    fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
    possible_names = [
        filename,
        filename.replace(".png", ".jpg").replace(".jpeg", ".jpg"),
        filename.replace(".jpg", ".png"),
    ]

    for name in possible_names:
        fixture_path = os.path.join(fixtures_dir, name)
        if os.path.exists(fixture_path):
            with open(fixture_path, "rb") as f:
                return f.read()

    try:
        from PIL import Image
        img = Image.new("RGB", size, color=fallback_color)
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format="PNG")
        return img_byte_arr.getvalue()
    except Exception:
        # Minimum valid 1x1 PNG fallback if PIL is missing and no fixture exists
        return (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc`\x00\x00"
            b"\x00\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
        )


# ─── T3.2.6 — T3.2.9 — Media Moderation & Image Safety Tests ────────────────

class TestMediaModeration:
    """
    Verifies image moderation, NSFW safety checks, face blurring, and corrupt image handling.
    """

    def test_T3_2_6_safe_civic_report_with_image_is_accepted(self, http_client, relayer_wallet, api_key):
        """T3.2.6 — A civic report with a valid safe image is ACCEPTED."""
        import json, hashlib

        description = "Pothole on Main Street requiring asphalt repair."

        img_bytes = get_test_image_bytes("sample_pothole.jpg", fallback_color=(73, 109, 137))
        file_sha256 = hashlib.sha256(img_bytes).hexdigest()

        nonce = str(uuid.uuid4())
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

        canonical_obj = build_canonical_object(description, timestamp=timestamp, nonce=nonce, media_hashes=[file_sha256])
        headers = build_signed_headers(relayer_wallet, canonical_obj, api_key, timestamp=timestamp, nonce=nonce)
        metadata = build_metadata(description, canonical_obj)

        response = http_client.post(
            REPORT_ENDPOINT,
            headers=headers,
            data={"metadata": json.dumps(metadata)},
            files=[("files", ("sample_pothole.jpg", io.BytesIO(img_bytes), "image/jpeg"))],
        )

        assert response.status_code == 200
        body = response.json()
        assert body.get("final_decision") == "ACCEPT", (
            f"Expected ACCEPT for safe image report. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )

    def test_T3_2_7_corrupted_image_is_rejected(self, http_client, relayer_wallet, api_key):
        """T3.2.7 — A corrupted image attachment is REJECTED by the safety oracle."""
        import json, hashlib

        description = "Report with broken corrupted image attachment."
        corrupt_bytes = b"NOT_A_REAL_IMAGE_DATA_0000000000"
        file_sha256 = hashlib.sha256(corrupt_bytes).hexdigest()

        nonce = str(uuid.uuid4())
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

        canonical_obj = build_canonical_object(description, timestamp=timestamp, nonce=nonce, media_hashes=[file_sha256])
        headers = build_signed_headers(relayer_wallet, canonical_obj, api_key, timestamp=timestamp, nonce=nonce)
        metadata = build_metadata(description, canonical_obj)

        response = http_client.post(
            REPORT_ENDPOINT,
            headers=headers,
            data={"metadata": json.dumps(metadata)},
            files=[("files", ("corrupt.png", io.BytesIO(corrupt_bytes), "image/png"))],
        )

        assert response.status_code == 200
        body = response.json()
        assert body.get("final_decision") == "REJECT", (
            f"Expected REJECT for corrupt image. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )

    def test_T3_2_8_nsfw_image_is_rejected(self, http_client, relayer_wallet, api_key):
        """T3.2.8 — A report with valid civic text but an NSFW/inappropriate image is REJECTED by safety oracle."""
        import json, hashlib

        description = "There is a large pothole at the intersection of Oak Street and 5th Avenue."

        img_bytes = get_test_image_bytes("sample_nsfw.jpg", fallback_color=(255, 105, 180), size=(200, 200))
        file_sha256 = hashlib.sha256(img_bytes).hexdigest()

        nonce = str(uuid.uuid4())
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

        canonical_obj = build_canonical_object(description, timestamp=timestamp, nonce=nonce, media_hashes=[file_sha256])
        headers = build_signed_headers(relayer_wallet, canonical_obj, api_key, timestamp=timestamp, nonce=nonce)
        metadata = build_metadata(description, canonical_obj)

        response = http_client.post(
            REPORT_ENDPOINT,
            headers=headers,
            data={"metadata": json.dumps(metadata)},
            files=[("files", ("sample_nsfw.jpg", io.BytesIO(img_bytes), "image/jpeg"))],
        )

        assert response.status_code == 200
        body = response.json()
        assert body.get("final_decision") == "REJECT", (
            f"Expected REJECT for NSFW image. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )

    def test_T3_2_9_face_blurring_image_is_accepted(self, http_client, relayer_wallet, api_key):
        """T3.2.9 — A civic report with an image containing people (people.jpg) is ACCEPTED and face blurred."""
        import json, hashlib

        description = "Public community gathering issue regarding park facilities."

        img_bytes = get_test_image_bytes("people.jpg", fallback_color=(200, 200, 200), size=(200, 200))
        file_sha256 = hashlib.sha256(img_bytes).hexdigest()

        nonce = str(uuid.uuid4())
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

        canonical_obj = build_canonical_object(description, timestamp=timestamp, nonce=nonce, media_hashes=[file_sha256])
        headers = build_signed_headers(relayer_wallet, canonical_obj, api_key, timestamp=timestamp, nonce=nonce)
        metadata = build_metadata(description, canonical_obj)

        response = http_client.post(
            REPORT_ENDPOINT,
            headers=headers,
            data={"metadata": json.dumps(metadata)},
            files=[("files", ("people.jpg", io.BytesIO(img_bytes), "image/jpeg"))],
        )

        assert response.status_code == 200
        body = response.json()
        assert body.get("final_decision") == "ACCEPT", (
            f"Expected ACCEPT for civic report with people photo. Got: {body.get('final_decision')}. "
            f"Reason: {body.get('summary_explanation')}"
        )

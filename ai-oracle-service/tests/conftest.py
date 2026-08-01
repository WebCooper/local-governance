"""
conftest.py — Shared pytest fixtures for AI Oracle tests

Provides:
- A valid relayer wallet (private key + address) matching the aggregator's
  TRUSTED_RELAYER_ADDRESS env var so every test can build signed requests.
- A helper function to build a fully-signed multipart request to the aggregator.
- The base URL of the aggregator (override via AGGREGATOR_TEST_URL env var).
"""
import hashlib
import json
import os
import time
import uuid
from typing import Optional

import pytest
import httpx
from eth_account import Account
from eth_account.messages import encode_defunct

from dotenv import load_dotenv

# Automatically load .env file from ai-oracle-service directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv()

# ─── Configuration ────────────────────────────────────────────────────────────

# Use relayer private key from environment (.env)
_DEFAULT_TEST_PRIVATE_KEY = os.getenv(
    "ORACLE_TEST_RELAYER_PRIVATE_KEY",
    os.getenv("RELAYER_PRIVATE_KEY", "")
)

# The aggregator under test — override with AGGREGATOR_TEST_URL
AGGREGATOR_BASE_URL = os.getenv(
    "AGGREGATOR_TEST_URL",
    "https://ai-oracle.internalbuildtools.online",
)

ORACLE_API_KEY = os.getenv("ORACLE_API_KEY", "")


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def relayer_wallet():
    """Returns an eth_account Account object for the trusted relayer."""
    account = Account.from_key(_DEFAULT_TEST_PRIVATE_KEY)
    return account


@pytest.fixture(scope="session")
def api_key():
    return ORACLE_API_KEY


@pytest.fixture(scope="session")
def base_url():
    return AGGREGATOR_BASE_URL


@pytest.fixture(scope="session")
def http_client():
    """A synchronous httpx client reused across the session."""
    with httpx.Client(base_url=AGGREGATOR_BASE_URL, timeout=60.0) as client:
        yield client


# ─── Signing Helper ───────────────────────────────────────────────────────────

def build_signed_headers(
    relayer_wallet,
    canonical_obj: dict,
    api_key: str,
    timestamp: Optional[str] = None,
    nonce: Optional[str] = None,
) -> dict:
    """
    Constructs the x-api-key, x-relayer-signature, x-request-timestamp,
    and x-request-nonce headers matching the aggregator's security middleware.
    """
    if timestamp is None:
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    if nonce is None:
        nonce = str(uuid.uuid4())

    # Canonical JSON: keys sorted alphabetically (mirrors TypeScript implementation)
    canonical_string = json.dumps(canonical_obj, sort_keys=True, separators=(",", ":"))
    request_hash = hashlib.sha256(canonical_string.encode("utf-8")).hexdigest()

    # Ethereum personal_sign
    msg = encode_defunct(text=request_hash)
    signed = relayer_wallet.sign_message(msg)
    relayer_signature = signed.signature.hex()
    if not relayer_signature.startswith("0x"):
        relayer_signature = "0x" + relayer_signature

    return {
        "x-api-key": api_key,
        "x-relayer-signature": relayer_signature,
        "x-request-timestamp": timestamp,
        "x-request-nonce": nonce,
    }


def build_canonical_object(
    description: str = "Test civic report",
    timestamp: Optional[str] = None,
    nonce: Optional[str] = None,
    media_hashes: Optional[list] = None,
) -> dict:
    """Creates the canonical object as the aggregator expects it."""
    if timestamp is None:
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    if nonce is None:
        nonce = str(uuid.uuid4())
    if media_hashes is None:
        media_hashes = []

    text_hash = hashlib.sha256(description.encode()).hexdigest()

    return {
        "report_id": f"RPT-{uuid.uuid4()}",
        "text_hash": text_hash,
        "media_hashes": media_hashes,
        "category": "General Civic Issue",
        "location": "Unknown",
        "ticket_hash": "0x" + "a" * 64,
        "payload_hash": text_hash,
        "timestamp": timestamp,
        "nonce": nonce,
    }


def build_metadata(description: str, canonical_obj: dict) -> dict:
    return {
        "report_id": canonical_obj["report_id"],
        "text": description,
        "category": canonical_obj["category"],
        "location": canonical_obj["location"],
        "ticket_hash": canonical_obj["ticket_hash"],
        "payload_hash": canonical_obj["payload_hash"],
        "citizen_signature": "0x" + "b" * 130,
        "government_ticket_signature": "0x" + "c" * 130,
    }

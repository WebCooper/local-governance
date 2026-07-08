import base64
import hashlib
import json
import os
import sqlite3
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi.middleware.cors import CORSMiddleware
import logging

import requests
from dotenv import load_dotenv
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

load_dotenv()

app = FastAPI(
    title="AI Oracle Aggregator",
    description="Secure AI moderation aggregator for civic report moderation.",
    version="2.1.0",
)

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("ai-oracle-aggregator")

cors_origins_raw = os.getenv(
    "ALLOWED_CORS_ORIGINS",
    "http://localhost:3001,https://relayer.internalbuildtools.online",
)

ALLOWED_CORS_ORIGINS = [
    origin.strip()
    for origin in cors_origins_raw.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "x-api-key",
        "x-relayer-signature",
        "x-request-timestamp",
        "x-request-nonce",
    ],
)

ORACLE_API_KEY = os.getenv("ORACLE_API_KEY", "change-this-secret")
AGGREGATOR_PRIVATE_KEY = os.getenv("AGGREGATOR_PRIVATE_KEY")
TRUSTED_RELAYER_ADDRESS = os.getenv("TRUSTED_RELAYER_ADDRESS", "").lower()

MAX_REQUEST_AGE_SECONDS = int(os.getenv("MAX_REQUEST_AGE_SECONDS", "300"))
MAX_FILES = int(os.getenv("MAX_FILES", "3"))
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "5"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

ORACLE_URLS = {
    "safety": "http://oracle-safety:8001/analyze",
    "spam": "http://oracle-spam:8002/analyze",
    "civic": "http://oracle-civic:8003/analyze",
}

DB_PATH = "/data/nonces.db"


class MediaItem(BaseModel):
    file_name: str
    mime_type: str
    sha256: str
    base64: str
    size_bytes: int


class OracleRequest(BaseModel):
    metadata: Dict[str, Any]
    media: List[MediaItem]
    text_hash: str
    media_hashes: List[str]
    report_hash: str
    request_hash: str


def init_db() -> None:
    os.makedirs("/data", exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS used_nonces (
            nonce TEXT PRIMARY KEY,
            request_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )

    conn.commit()
    conn.close()


@app.on_event("startup")
def startup() -> None:
    init_db()


def canonical_json(data: Dict[str, Any]) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def hash_dict(data: Dict[str, Any]) -> str:
    return sha256_text(canonical_json(data))


def sign_hash(message_hash: str) -> str:
    if not AGGREGATOR_PRIVATE_KEY:
        return ""

    message = encode_defunct(text=message_hash)
    signed = Account.sign_message(message, private_key=AGGREGATOR_PRIVATE_KEY)
    return signed.signature.hex()


def recover_signer(message_hash: str, signature: str) -> str:
    message = encode_defunct(text=message_hash)
    return Account.recover_message(message, signature=signature).lower()

    

def parse_timestamp(timestamp_str: str) -> datetime:
    try:
        if timestamp_str.endswith("Z"):
            timestamp_str = timestamp_str.replace("Z", "+00:00")

        dt = datetime.fromisoformat(timestamp_str)

        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

        return dt.astimezone(timezone.utc)

    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request timestamp")


def validate_timestamp(timestamp_str: str) -> None:
    request_time = parse_timestamp(timestamp_str)
    now = datetime.now(timezone.utc)

    age_seconds = abs((now - request_time).total_seconds())

    if age_seconds > MAX_REQUEST_AGE_SECONDS:
        raise HTTPException(status_code=401, detail="Request timestamp expired")


def validate_and_store_nonce(nonce: str, request_hash: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    try:
        cur.execute(
            """
            INSERT INTO used_nonces (nonce, request_hash, created_at)
            VALUES (?, ?, ?)
            """,
            (nonce, request_hash, int(time.time())),
        )
        conn.commit()

    except sqlite3.IntegrityError:
        raise HTTPException(status_code=401, detail="Replay detected: nonce already used")

    finally:
        conn.close()


def build_signed_request_object(
    metadata: Dict[str, Any],
    text_hash: str,
    media_hashes: List[str],
    timestamp: str,
    nonce: str,
) -> Dict[str, Any]:
    return {
        "report_id": metadata.get("report_id", ""),
        "text_hash": text_hash,
        "media_hashes": media_hashes,
        "category": metadata.get("category", ""),
        "location": metadata.get("location", ""),
        "ticket_hash": metadata.get("ticket_hash", ""),
        "payload_hash": metadata.get("payload_hash", ""),
        "timestamp": timestamp,
        "nonce": nonce,
    }


def validate_metadata(metadata: Dict[str, Any]) -> None:
    required = [
        "report_id",
        "text",
        "category",
        "location",
        "ticket_hash",
        "payload_hash",
    ]

    missing = [field for field in required if not metadata.get(field)]

    if missing:
        raise HTTPException(status_code=400, detail=f"Missing metadata fields: {missing}")

    if not isinstance(metadata["text"], str) or not metadata["text"].strip():
        raise HTTPException(status_code=400, detail="Report text cannot be empty")


async def process_uploaded_files(files: Optional[List[UploadFile]]) -> List[MediaItem]:
    if not files:
        return []

    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES} files allowed")

    processed: List[MediaItem] = []

    for file in files:
        content = await file.read()

        if len(content) == 0:
            raise HTTPException(status_code=400, detail=f"Empty file: {file.filename}")

        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File {file.filename} exceeds {MAX_FILE_SIZE_MB} MB limit",
            )

        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file.content_type}",
            )

        processed.append(
            MediaItem(
                file_name=file.filename or "unknown",
                mime_type=file.content_type or "unknown",
                sha256=sha256_bytes(content),
                base64=base64.b64encode(content).decode("utf-8"),
                size_bytes=len(content),
            )
        )

    return processed


def verify_relayer_signature(request_hash: str, signature: str) -> str:
    """
    Verifies that the moderation request was signed by the trusted backend relayer.
    The relayer address is recovered from the signature and compared with
    TRUSTED_RELAYER_ADDRESS from the environment.
    """

    if not TRUSTED_RELAYER_ADDRESS:
        logger.error("TRUSTED_RELAYER_ADDRESS is not configured")
        raise HTTPException(status_code=500, detail="Trusted relayer address not configured")

    try:
        recovered_address = recover_signer(request_hash, signature)
    except Exception as e:
        logger.error("Failed to recover relayer signer: %s", str(e))
        raise HTTPException(
            status_code=401,
            detail={
                "error": "Invalid relayer signature",
                "debug": str(e),
            },
        )

    recovered_address = recovered_address.strip().lower()
    trusted_address = TRUSTED_RELAYER_ADDRESS.strip().strip('"').strip("'").lower()

    # Keep only warnings/errors for authentication flow.

    if recovered_address != trusted_address:
        logger.warning(
            "Relayer signature mismatch. recovered=%s trusted=%s request_hash=%s",
            recovered_address,
            trusted_address,
            request_hash,
        )

        raise HTTPException(
            status_code=401,
            detail={
                "error": "Request not signed by trusted relayer",
                "recovered_address": recovered_address,
                "trusted_relayer_address": trusted_address,
                "request_hash": request_hash,
            },
        )

    return recovered_address


def call_oracle(oracle_name: str, oracle_url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        response = requests.post(oracle_url, json=payload, timeout=120)

        if response.status_code >= 400:
            return {
                "oracle_id": f"ORACLE_{oracle_name.upper()}",
                "vote": "REJECT",
                "confidence": 1.0,
                "explanation_code": "ORACLE_REQUEST_FAILED",
                "model_name": "unavailable",
                "model_version": "unknown",
                "critical_violation": True,
                "details": {
                    "status_code": response.status_code,
                    "response_text": response.text,
                    "oracle_url": oracle_url,
                },
            }

        return response.json()

    except Exception as e:
        return {
            "oracle_id": f"ORACLE_{oracle_name.upper()}",
            "vote": "REJECT",
            "confidence": 1.0,
            "explanation_code": "ORACLE_UNAVAILABLE",
            "model_name": "unavailable",
            "model_version": "unknown",
            "critical_violation": True,
            "details": {
                "error": str(e),
                "oracle_url": oracle_url,
            },
        }

def aggregate_votes(oracle_votes: List[Dict[str, Any]]) -> Dict[str, Any]:
    accept_count = sum(1 for vote in oracle_votes if vote.get("vote") == "ACCEPT")
    reject_count = sum(1 for vote in oracle_votes if vote.get("vote") == "REJECT")

    critical_violation = any(vote.get("critical_violation") is True for vote in oracle_votes)

    civic_rejection = any(
        vote.get("oracle_id") == "ORACLE_3_CIVIC_RELEVANCE"
        and vote.get("vote") == "REJECT"
        and vote.get("explanation_code")
        in ["LOW_CIVIC_RELEVANCE", "NON_CIVIC_CONTENT"]
        for vote in oracle_votes
    )

    if critical_violation:
        final_decision = "REJECT"
        risk_level = "HIGH"
        summary = "Report rejected due to a critical safety or system violation."

    elif civic_rejection:
        final_decision = "REJECT"
        risk_level = "MEDIUM"
        summary = "Report rejected because it does not appear to describe a valid civic issue."

    elif accept_count >= 2:
        final_decision = "ACCEPT"
        risk_level = "LOW"
        summary = "Report accepted. Text and media passed moderation checks."

    else:
        final_decision = "REJECT"
        risk_level = "MEDIUM"
        summary = "Report rejected because the oracle votes did not reach acceptance majority."

    selected_confidences = [
        vote.get("confidence", 0.0)
        for vote in oracle_votes
        if vote.get("vote") == final_decision
    ]

    if selected_confidences:
        final_confidence = sum(selected_confidences) / len(selected_confidences)
    else:
        final_confidence = (
            sum(vote.get("confidence", 0.0) for vote in oracle_votes) / len(oracle_votes)
        )

    return {
        "final_decision": final_decision,
        "final_confidence": round(final_confidence, 4),
        "risk_level": risk_level,
        "summary_explanation": summary,
        "accept_count": accept_count,
        "reject_count": reject_count,
        "critical_violation": critical_violation,
    }


@app.get("/")
def root():
    return {
        "service": "AI_ORACLE_AGGREGATOR",
        "status": "running",
        "version": "2.1.0",
        "decision_mode": "ACCEPT_REJECT_ONLY",
        "relayer_auth": "signature_recovery",
        "oracles": list(ORACLE_URLS.keys()),
    }


@app.post("/moderate/report")
async def moderate_report(
    metadata: str = Form(...),
    files: Optional[List[UploadFile]] = File(default=None),
    x_api_key: Optional[str] = Header(default=None, alias="x-api-key"),
    x_relayer_signature: Optional[str] = Header(default=None, alias="x-relayer-signature"),
    x_request_timestamp: Optional[str] = Header(default=None, alias="x-request-timestamp"),
    x_request_nonce: Optional[str] = Header(default=None, alias="x-request-nonce"),
):
    start_time = time.time()

    if x_api_key != ORACLE_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    if not x_relayer_signature:
        raise HTTPException(status_code=401, detail="Missing relayer signature")

    if not x_request_timestamp:
        raise HTTPException(status_code=401, detail="Missing request timestamp")

    if not x_request_nonce:
        raise HTTPException(status_code=401, detail="Missing request nonce")

    validate_timestamp(x_request_timestamp)

    try:
        metadata_dict = json.loads(metadata)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid metadata JSON")

    validate_metadata(metadata_dict)

    media_items = await process_uploaded_files(files)
    media_hashes = [item.sha256 for item in media_items]
    text_hash = sha256_text(metadata_dict["text"])

    signed_request_object = build_signed_request_object(
        metadata=metadata_dict,
        text_hash=text_hash,
        media_hashes=media_hashes,
        timestamp=x_request_timestamp,
        nonce=x_request_nonce,
    )

    request_hash = hash_dict(signed_request_object)

    recovered_relayer_address = verify_relayer_signature(
        request_hash=request_hash,
        signature=x_relayer_signature,
    )

    validate_and_store_nonce(x_request_nonce, request_hash)

    report_hash = hash_dict(
        {
            "metadata": metadata_dict,
            "text_hash": text_hash,
            "media_hashes": media_hashes,
        }
    )

    oracle_request = OracleRequest(
        metadata=metadata_dict,
        media=media_items,
        text_hash=text_hash,
        media_hashes=media_hashes,
        report_hash=report_hash,
        request_hash=request_hash,
    )

    oracle_payload = oracle_request.model_dump()

    oracle_votes = []

    for oracle_name, oracle_url in ORACLE_URLS.items():
        vote = call_oracle(oracle_name, oracle_url, oracle_payload)
        oracle_votes.append(vote)
    
    aggregation = aggregate_votes(oracle_votes)

    logger.info(
        "Aggregation decision=%s confidence=%s risk=%s summary=%s",
        aggregation["final_decision"],
        aggregation["final_confidence"],
        aggregation["risk_level"],
        aggregation["summary_explanation"],
    )

    decision_object = {
        "report_hash": report_hash,
        "request_hash": request_hash,
        "final_decision": aggregation["final_decision"],
        "final_confidence": aggregation["final_confidence"],
        "risk_level": aggregation["risk_level"],
        "oracle_votes_summary": [
            {
                "oracle_id": vote.get("oracle_id"),
                "vote": vote.get("vote"),
                "confidence": vote.get("confidence"),
                "explanation_code": vote.get("explanation_code"),
                "critical_violation": vote.get("critical_violation"),
            }
            for vote in oracle_votes
        ],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    decision_hash = hash_dict(decision_object)
    aggregator_signature = sign_hash(decision_hash)

    processing_time_ms = round((time.time() - start_time) * 1000, 2)

    return {
        "final_decision": aggregation["final_decision"],
        "final_confidence": aggregation["final_confidence"],
        "risk_level": aggregation["risk_level"],
        "report_hash": report_hash,
        "request_hash": request_hash,
        "decision_hash": decision_hash,
        "aggregator_signature": aggregator_signature,
        "summary_explanation": aggregation["summary_explanation"],
        "oracle_votes": oracle_votes,
        "security": {
            "relayer_signature_verified": True,
            "recovered_relayer_address": recovered_relayer_address,
            "timestamp_validated": True,
            "nonce_accepted": True,
        },
        "processing_time_ms": processing_time_ms,
    }
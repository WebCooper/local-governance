import csv
import hashlib
import json
import mimetypes
import os
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from eth_account import Account
from eth_account.messages import encode_defunct

load_dotenv()

AGGREGATOR_URL = os.getenv("AGGREGATOR_URL", "http://localhost:8000/moderate/report")
ORACLE_API_KEY = os.getenv("ORACLE_API_KEY", "change-this-secret")
RELAYER_PRIVATE_KEY = os.getenv("RELAYER_PRIVATE_KEY")
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "5"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

if not RELAYER_PRIVATE_KEY:
    raise ValueError("RELAYER_PRIVATE_KEY is missing in .env")

BASE_DIR = Path(__file__).resolve().parent.parent
RESULTS_DIR = BASE_DIR / "test_results"
JSON_RESULTS_DIR = RESULTS_DIR / "json"

JSON_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

SUMMARY_CSV = RESULTS_DIR / "ai_moderation_summary.csv"
SUMMARY_MD = RESULTS_DIR / "ai_moderation_summary.md"


def canonical_json(data: Any) -> str:
    if data is None or not isinstance(data, (dict, list)):
        return json.dumps(data, ensure_ascii=False)

    if isinstance(data, list):
        return "[" + ",".join(canonical_json(item) for item in data) + "]"

    return (
        "{"
        + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + canonical_json(data[key])
            for key in sorted(data.keys())
        )
        + "}"
    )


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hash_dict(data: Dict[str, Any]) -> str:
    return sha256_text(canonical_json(data))


def sign_hash(message_hash: str, private_key: str) -> str:
    message = encode_defunct(text=message_hash)
    signed = Account.sign_message(message, private_key=private_key)
    return signed.signature.hex()


def get_relayer_address() -> str:
    wallet = Account.from_key(RELAYER_PRIVATE_KEY)
    return wallet.address


def read_files(image_paths: Optional[List[str]]) -> Tuple[List[Tuple], List[str], List[Dict[str, Any]]]:
    files = []
    media_hashes = []
    file_summaries = []

    if not image_paths:
        return files, media_hashes, file_summaries

    for image_path_str in image_paths:
        image_path = Path(image_path_str)

        if not image_path.is_absolute():
            image_path = BASE_DIR / image_path

        if not image_path.exists():
            raise FileNotFoundError(f"Image file not found: {image_path}")

        image_bytes = image_path.read_bytes()
        file_hash = sha256_bytes(image_bytes)
        media_hashes.append(file_hash)

        mime_type, _ = mimetypes.guess_type(str(image_path))
        mime_type = mime_type or "image/jpeg"

        files.append(
            (
                "files",
                (
                    image_path.name,
                    image_bytes,
                    mime_type,
                ),
            )
        )

        file_summaries.append(
            {
                "file_name": image_path.name,
                "mime_type": mime_type,
                "size_bytes": len(image_bytes),
                "sha256": file_hash,
            }
        )

    return files, media_hashes, file_summaries


def read_raw_files(raw_files: Optional[List[Dict[str, Any]]]) -> Tuple[List[Tuple], List[str], List[Dict[str, Any]]]:
    files = []
    media_hashes = []
    file_summaries = []

    if not raw_files:
        return files, media_hashes, file_summaries

    for raw_file in raw_files:
        name = raw_file.get("name", "file.bin")
        content = raw_file.get("content", b"")
        mime_type = raw_file.get("mime_type", "application/octet-stream")

        if not isinstance(content, (bytes, bytearray)):
            raise ValueError(f"Raw file content must be bytes for {name}")

        file_hash = sha256_bytes(bytes(content))
        media_hashes.append(file_hash)

        files.append(
            (
                "files",
                (
                    name,
                    bytes(content),
                    mime_type,
                ),
            )
        )

        file_summaries.append(
            {
                "file_name": name,
                "mime_type": mime_type,
                "size_bytes": len(content),
                "sha256": file_hash,
            }
        )

    return files, media_hashes, file_summaries


def build_metadata(test_case: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "report_id": test_case.get("report_id", f"RPT-{test_case['id']}-{uuid.uuid4()}"),
        "text": test_case.get("text", ""),
        "category": test_case.get("category", "Other"),
        "location": test_case.get("location", "Matara"),
        "ticket_hash": test_case.get("ticket_hash", "0xabc123ticket"),
        "payload_hash": test_case.get("payload_hash", "0xdef456payload"),
        "citizen_signature": "0xmockcitizensignature",
        "government_ticket_signature": "0xmockgovernmentsignature",
    }


def build_signed_object(
    metadata: Dict[str, Any],
    media_hashes: List[str],
    timestamp: str,
    nonce: str,
) -> Dict[str, Any]:
    text_hash = sha256_text(metadata.get("text", ""))

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


def send_request(
    test_case: Dict[str, Any],
    override_api_key: Optional[str] = None,
    remove_api_key: bool = False,
    remove_relayer_signature: bool = False,
    remove_timestamp: bool = False,
    remove_nonce: bool = False,
    invalid_signature: bool = False,
    fixed_timestamp: Optional[str] = None,
    fixed_nonce: Optional[str] = None,
) -> Dict[str, Any]:
    metadata = build_metadata(test_case)
    metadata_overrides = test_case.get("metadata_overrides", {})
    metadata_remove = test_case.get("metadata_remove", [])

    if metadata_overrides:
        metadata.update(metadata_overrides)

    for key in metadata_remove:
        metadata.pop(key, None)

    image_paths = test_case.get("image_paths", [])
    raw_files = test_case.get("raw_files", [])
    files, media_hashes, file_summaries = read_files(image_paths)
    raw_files_data = read_raw_files(raw_files)
    files.extend(raw_files_data[0])
    media_hashes.extend(raw_files_data[1])
    file_summaries.extend(raw_files_data[2])

    timestamp = fixed_timestamp or datetime.now(timezone.utc).isoformat()
    nonce = fixed_nonce or str(uuid.uuid4())

    signed_object = build_signed_object(
        metadata=metadata,
        media_hashes=media_hashes,
        timestamp=timestamp,
        nonce=nonce,
    )

    request_hash = hash_dict(signed_object)

    if invalid_signature:
        signature = sign_hash("invalid-request-hash-for-testing", RELAYER_PRIVATE_KEY)
    else:
        signature = sign_hash(request_hash, RELAYER_PRIVATE_KEY)

    headers = {}

    if not remove_relayer_signature:
        headers["x-relayer-signature"] = signature

    if not remove_timestamp:
        headers["x-request-timestamp"] = timestamp

    if not remove_nonce:
        headers["x-request-nonce"] = nonce

    if not remove_api_key:
        headers["x-api-key"] = override_api_key if override_api_key is not None else ORACLE_API_KEY

    raw_metadata = test_case.get("raw_metadata")

    if raw_metadata is not None:
        metadata_payload = raw_metadata
    else:
        metadata_payload = json.dumps(metadata)

    data = {
        "metadata": metadata_payload,
    }

    started_at = time.time()

    response = requests.post(
        AGGREGATOR_URL,
        headers=headers,
        data=data,
        files=files,
        timeout=180,
    )

    elapsed_ms = round((time.time() - started_at) * 1000, 2)

    try:
        response_json = response.json()
    except Exception:
        response_json = {
            "raw_response": response.text
        }

    return {
        "test_id": test_case["id"],
        "name": test_case["name"],
        "expected_http_status": test_case.get("expected_http_status", 200),
        "expected_decision": test_case.get("expected_decision"),
        "actual_http_status": response.status_code,
        "actual_decision": response_json.get("final_decision"),
        "passed": evaluate_result(test_case, response.status_code, response_json),
        "elapsed_ms_client": elapsed_ms,
        "processing_time_ms_server": response_json.get("processing_time_ms"),
        "request_hash_local": request_hash,
        "relayer_address": get_relayer_address(),
        "metadata": metadata,
        "signed_object": signed_object,
        "file_summaries": file_summaries,
        "response": response_json,
    }


def evaluate_result(test_case: Dict[str, Any], status_code: int, response_json: Dict[str, Any]) -> bool:
    expected_status = test_case.get("expected_http_status", 200)
    expected_decision = test_case.get("expected_decision")

    if status_code != expected_status:
        return False

    if expected_decision is not None:
        return response_json.get("final_decision") == expected_decision

    return True


def save_json_result(result: Dict[str, Any]) -> None:
    output_path = JSON_RESULTS_DIR / f"{result['test_id']}.json"

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)


def write_summary(results: List[Dict[str, Any]]) -> None:
    with open(SUMMARY_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)

        writer.writerow(
            [
                "Test ID",
                "Name",
                "Expected HTTP",
                "Actual HTTP",
                "Expected Decision",
                "Actual Decision",
                "Status",
                "Client Time (ms)",
                "Server Processing Time (ms)",
            ]
        )

        for result in results:
            writer.writerow(
                [
                    result["test_id"],
                    result["name"],
                    result["expected_http_status"],
                    result["actual_http_status"],
                    result.get("expected_decision", ""),
                    result.get("actual_decision", ""),
                    "PASSED" if result["passed"] else "FAILED",
                    result["elapsed_ms_client"],
                    result.get("processing_time_ms_server", ""),
                ]
            )

    with open(SUMMARY_MD, "w", encoding="utf-8") as f:
        f.write("# AI Moderation Test Summary\n\n")
        f.write(f"Aggregator URL: `{AGGREGATOR_URL}`\n\n")
        f.write(f"Relayer address used for signing: `{get_relayer_address()}`\n\n")
        f.write(
            "| Test ID | Name | Expected HTTP | Actual HTTP | Expected Decision | Actual Decision | Status | Client Time (ms) | Server Time (ms) |\n"
        )
        f.write(
            "|---|---|---:|---:|---|---|---|---:|---:|\n"
        )

        for result in results:
            status = "PASSED" if result["passed"] else "FAILED"

            f.write(
                f"| {result['test_id']} "
                f"| {result['name']} "
                f"| {result['expected_http_status']} "
                f"| {result['actual_http_status']} "
                f"| {result.get('expected_decision', '')} "
                f"| {result.get('actual_decision', '')} "
                f"| {status} "
                f"| {result['elapsed_ms_client']} "
                f"| {result.get('processing_time_ms_server', '')} |\n"
            )


def run_standard_tests() -> List[Dict[str, Any]]:
    test_cases = [
        {
            "id": "AI-S01",
            "name": "Valid civic text report - road damage",
            "text": "There is a large pothole near the public school road causing traffic problems.",
            "category": "Road Damage",
            "expected_decision": "ACCEPT",
        },
        {
            "id": "AI-S02",
            "name": "Valid civic text report - waste management",
            "text": "Garbage has not been collected near the public market for three days.",
            "category": "Waste Management",
            "expected_decision": "ACCEPT",
        },
        {
            "id": "AI-S03",
            "name": "Spam promotional text",
            "text": "BUY NOW FREE MONEY CLICK HERE LIMITED OFFER SUBSCRIBE NOW!!!!",
            "category": "Other",
            "expected_decision": "REJECT",
        },
        {
            "id": "AI-S04",
            "name": "Threatening text",
            "text": "There is a pothole near the school and I will attack the officer if this is not fixed.",
            "category": "Road Damage",
            "expected_decision": "REJECT",
        },
        {
            "id": "AI-S05",
            "name": "Non-civic irrelevant text",
            "text": "I watched a movie yesterday and the food at the restaurant was very tasty.",
            "category": "Other",
            "expected_decision": "REJECT",
        },
        {
            "id": "AI-S06",
            "name": "Empty report text",
            "text": "",
            "category": "Road Damage",
            "expected_http_status": 400,
            "expected_decision": None,
        },
        {
            "id": "AI-S07",
            "name": "Valid civic text with safe pothole image",
            "text": "There is a damaged road section with a pothole near the bus stop.",
            "category": "Road Damage",
            "image_paths": ["test_client/test_assets/safe/pothole_road.png"],
            "expected_decision": "ACCEPT",
            "skip_if_file_missing": True,
        },
        {
            "id": "AI-S08",
            "name": "Valid civic text with safe garbage image",
            "text": "Garbage has been dumped near the public road and it is causing a bad smell.",
            "category": "Waste Management",
            "image_paths": ["test_client/test_assets/safe/garbage_street.png"],
            "expected_decision": "ACCEPT",
            "skip_if_file_missing": True,
        },
        {
            "id": "AI-S09",
            "name": "Valid civic text with unsafe image",
            "text": "There is a pothole near the public school road.",
            "category": "Road Damage",
            "image_paths": ["test_client/test_assets/unsafe/unsafe_test_image.png"],
            "expected_decision": "REJECT",
            "skip_if_file_missing": True,
        },
        {
            "id": "AI-S10",
            "name": "Corrupted image file",
            "text": "There is a pothole near the public school road.",
            "category": "Road Damage",
            "image_paths": ["test_client/test_assets/invalid/fake_image.png"],
            "expected_decision": "REJECT",
            "skip_if_file_missing": True,
        },
    ]

    results = []

    for test_case in test_cases:
        print(f"\nRunning {test_case['id']} - {test_case['name']}")

        if test_case.get("skip_if_file_missing"):
            missing_files = []

            for image_path in test_case.get("image_paths", []):
                full_path = BASE_DIR / image_path
                if not full_path.exists():
                    missing_files.append(str(full_path))

            if missing_files:
                result = {
                    "test_id": test_case["id"],
                    "name": test_case["name"],
                    "expected_http_status": test_case.get("expected_http_status", 200),
                    "actual_http_status": "SKIPPED",
                    "expected_decision": test_case.get("expected_decision"),
                    "actual_decision": "SKIPPED",
                    "passed": False,
                    "elapsed_ms_client": "",
                    "processing_time_ms_server": "",
                    "skip_reason": f"Missing files: {missing_files}",
                    "response": {},
                }

                print(f"Skipped. Missing files: {missing_files}")
                results.append(result)
                save_json_result(result)
                continue

        result = send_request(test_case)
        results.append(result)
        save_json_result(result)

        print(f"HTTP: {result['actual_http_status']}")
        print(f"Decision: {result.get('actual_decision')}")
        print(f"Status: {'PASSED' if result['passed'] else 'FAILED'}")

    return results


def run_security_tests() -> List[Dict[str, Any]]:
    results = []

    base_case = {
        "id": "AI-SEC-BASE",
        "name": "Base valid report for security tests",
        "text": "There is a pothole near the public school road.",
        "category": "Road Damage",
        "expected_decision": "ACCEPT",
    }

    print("\nRunning AI-SEC-01 - Missing API key")
    test_case = {
        **base_case,
        "id": "AI-SEC-01",
        "name": "Missing API key",
        "expected_http_status": 401,
        "expected_decision": None,
    }
    result = send_request(test_case, remove_api_key=True)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-SEC-02 - Wrong API key")
    test_case = {
        **base_case,
        "id": "AI-SEC-02",
        "name": "Wrong API key",
        "expected_http_status": 401,
        "expected_decision": None,
    }
    result = send_request(test_case, override_api_key="wrong-api-key")
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-SEC-03 - Invalid relayer signature")
    test_case = {
        **base_case,
        "id": "AI-SEC-03",
        "name": "Invalid relayer signature",
        "expected_http_status": 401,
        "expected_decision": None,
    }
    result = send_request(test_case, invalid_signature=True)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-SEC-04 - Expired timestamp")
    expired_timestamp = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    test_case = {
        **base_case,
        "id": "AI-SEC-04",
        "name": "Expired timestamp",
        "expected_http_status": 401,
        "expected_decision": None,
    }
    result = send_request(test_case, fixed_timestamp=expired_timestamp)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-SEC-05 - Reused nonce replay test")
    replay_nonce = str(uuid.uuid4())
    replay_timestamp = datetime.now(timezone.utc).isoformat()

    first_case = {
        **base_case,
        "id": "AI-SEC-05A",
        "name": "Replay test first request",
        "expected_http_status": 200,
        "expected_decision": "ACCEPT",
    }

    second_case = {
        **base_case,
        "id": "AI-SEC-05B",
        "name": "Replay test second request with same nonce",
        "expected_http_status": 401,
        "expected_decision": None,
    }

    first_result = send_request(
        first_case,
        fixed_timestamp=replay_timestamp,
        fixed_nonce=replay_nonce,
    )
    results.append(first_result)
    save_json_result(first_result)

    second_result = send_request(
        second_case,
        fixed_timestamp=replay_timestamp,
        fixed_nonce=replay_nonce,
    )
    results.append(second_result)
    save_json_result(second_result)

    for result in results:
        print(f"{result['test_id']} -> HTTP {result['actual_http_status']} -> {'PASSED' if result['passed'] else 'FAILED'}")

    return results


def run_validation_tests() -> List[Dict[str, Any]]:
    results = []

    base_case = {
        "id": "AI-VAL-BASE",
        "name": "Base valid report for validation tests",
        "text": "There is a pothole near the public school road.",
        "category": "Road Damage",
        "expected_decision": "ACCEPT",
    }

    print("\nRunning AI-VAL-01 - Missing relayer signature")
    test_case = {
        **base_case,
        "id": "AI-VAL-01",
        "name": "Missing relayer signature",
        "expected_http_status": 401,
        "expected_decision": None,
    }
    result = send_request(test_case, remove_relayer_signature=True)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-VAL-02 - Missing request timestamp")
    test_case = {
        **base_case,
        "id": "AI-VAL-02",
        "name": "Missing request timestamp",
        "expected_http_status": 401,
        "expected_decision": None,
    }
    result = send_request(test_case, remove_timestamp=True)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-VAL-03 - Missing request nonce")
    test_case = {
        **base_case,
        "id": "AI-VAL-03",
        "name": "Missing request nonce",
        "expected_http_status": 401,
        "expected_decision": None,
    }
    result = send_request(test_case, remove_nonce=True)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-VAL-04 - Invalid timestamp format")
    test_case = {
        **base_case,
        "id": "AI-VAL-04",
        "name": "Invalid timestamp format",
        "expected_http_status": 400,
        "expected_decision": None,
    }
    result = send_request(test_case, fixed_timestamp="not-a-timestamp")
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-VAL-05 - Future timestamp beyond max age")
    future_timestamp = (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat()
    test_case = {
        **base_case,
        "id": "AI-VAL-05",
        "name": "Future timestamp beyond max age",
        "expected_http_status": 401,
        "expected_decision": None,
    }
    result = send_request(test_case, fixed_timestamp=future_timestamp)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-VAL-06 - Invalid metadata JSON")
    test_case = {
        **base_case,
        "id": "AI-VAL-06",
        "name": "Invalid metadata JSON",
        "expected_http_status": 400,
        "expected_decision": None,
        "raw_metadata": "{not-valid-json}",
    }
    result = send_request(test_case)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-VAL-07 - Missing report_id")
    test_case = {
        **base_case,
        "id": "AI-VAL-07",
        "name": "Missing report_id",
        "expected_http_status": 400,
        "expected_decision": None,
        "metadata_remove": ["report_id"],
    }
    result = send_request(test_case)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-VAL-08 - Missing payload_hash")
    test_case = {
        **base_case,
        "id": "AI-VAL-08",
        "name": "Missing payload_hash",
        "expected_http_status": 400,
        "expected_decision": None,
        "metadata_remove": ["payload_hash"],
    }
    result = send_request(test_case)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-VAL-09 - Whitespace-only text")
    test_case = {
        **base_case,
        "id": "AI-VAL-09",
        "name": "Whitespace-only text",
        "expected_http_status": 400,
        "expected_decision": None,
        "metadata_overrides": {"text": "   "},
    }
    result = send_request(test_case)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-VAL-10 - Too many files")
    test_case = {
        **base_case,
        "id": "AI-VAL-10",
        "name": "Too many files",
        "expected_http_status": 400,
        "expected_decision": None,
        "raw_files": [
            {"name": "one.png", "content": b"a", "mime_type": "image/png"},
            {"name": "two.png", "content": b"b", "mime_type": "image/png"},
            {"name": "three.png", "content": b"c", "mime_type": "image/png"},
            {"name": "four.png", "content": b"d", "mime_type": "image/png"},
        ],
    }
    result = send_request(test_case)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-VAL-11 - Unsupported file MIME type")
    test_case = {
        **base_case,
        "id": "AI-VAL-11",
        "name": "Unsupported file MIME type",
        "expected_http_status": 400,
        "expected_decision": None,
        "raw_files": [
            {"name": "note.txt", "content": b"text", "mime_type": "text/plain"}
        ],
    }
    result = send_request(test_case)
    results.append(result)
    save_json_result(result)

    print("\nRunning AI-VAL-12 - Oversized file")
    oversized_content = b"x" * (MAX_FILE_SIZE_BYTES + 1)
    test_case = {
        **base_case,
        "id": "AI-VAL-12",
        "name": "Oversized file",
        "expected_http_status": 400,
        "expected_decision": None,
        "raw_files": [
            {"name": "large.png", "content": oversized_content, "mime_type": "image/png"}
        ],
    }
    result = send_request(test_case)
    results.append(result)
    save_json_result(result)

    for result in results:
        print(f"{result['test_id']} -> HTTP {result['actual_http_status']} -> {'PASSED' if result['passed'] else 'FAILED'}")

    return results


def main():
    print("AI Moderation Automated Test Runner")
    print("-----------------------------------")
    print(f"Aggregator URL: {AGGREGATOR_URL}")
    print(f"Relayer address: {get_relayer_address()}")

    all_results = []

    all_results.extend(run_standard_tests())
    all_results.extend(run_security_tests())
    all_results.extend(run_validation_tests())

    write_summary(all_results)

    passed = sum(1 for result in all_results if result["passed"])
    total = len(all_results)

    print("\nTesting completed.")
    print(f"Passed: {passed}/{total}")
    print(f"Summary CSV: {SUMMARY_CSV}")
    print(f"Summary Markdown: {SUMMARY_MD}")
    print(f"JSON results directory: {JSON_RESULTS_DIR}")


if __name__ == "__main__":
    main()
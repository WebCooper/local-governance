import base64
import io
import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image

app = FastAPI(title="Oracle 1 - Safety Oracle")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("oracle-safety")

ENABLE_AI_MODELS = os.getenv("ENABLE_AI_MODELS", "true").lower() == "true"

text_classifier = None
image_classifier = None


class MediaItem(BaseModel):
    file_name: str
    mime_type: str
    sha256: str
    base64: str
    size_bytes: int


class OracleRequest(BaseModel):
    metadata: Dict[str, Any]
    media: List[MediaItem] = []
    text_hash: str
    media_hashes: List[str] = []
    report_hash: str
    request_hash: str


def load_models():
    global text_classifier, image_classifier

    if not ENABLE_AI_MODELS:
        return

    try:
        from transformers import pipeline

        text_classifier = pipeline(
            "text-classification",
            model="unitary/toxic-bert",
            top_k=None,
        )

        image_classifier = pipeline(
            "image-classification",
            model="Falconsai/nsfw_image_detection",
        )

    except Exception as e:
        print(f"[Safety Oracle] Model loading failed. Fallback rules enabled. Error: {e}")
        text_classifier = None
        image_classifier = None


@app.on_event("startup")
def startup():
    load_models()


@app.get("/")
def root():
    return {
        "oracle_id": "ORACLE_1_SAFETY",
        "status": "running",
        "ai_models_enabled": ENABLE_AI_MODELS,
    }


def decode_image(media: MediaItem) -> Optional[Image.Image]:
    try:
        raw = base64.b64decode(media.base64)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        return image
    except Exception:
        return None


def fallback_text_safety(text: str) -> Dict[str, Any]:
    lower = text.lower()

    critical_words = ["kill", "bomb", "attack", "terrorist", "murder"]
    toxic_words = ["idiot", "stupid", "hate", "racist", "threat"]

    critical_matches = [word for word in critical_words if word in lower]
    toxic_matches = [word for word in toxic_words if word in lower]

    if critical_matches:
        return {
            "safe": False,
            "confidence": 0.95,
            "critical_violation": True,
            "explanation_code": "CRITICAL_THREAT_DETECTED",
            "details": {
                "critical_matches": critical_matches,
                "toxic_matches": toxic_matches,
                "mode": "fallback_rules",
            },
        }

    if len(toxic_matches) >= 2:
        return {
            "safe": False,
            "confidence": 0.85,
            "critical_violation": False,
            "explanation_code": "TOXIC_LANGUAGE_DETECTED",
            "details": {
                "critical_matches": critical_matches,
                "toxic_matches": toxic_matches,
                "mode": "fallback_rules",
            },
        }

    return {
        "safe": True,
        "confidence": 0.75,
        "critical_violation": False,
        "explanation_code": "TEXT_SAFE",
        "details": {
            "critical_matches": critical_matches,
            "toxic_matches": toxic_matches,
            "mode": "fallback_rules",
        },
    }


def ai_text_safety(text: str) -> Dict[str, Any]:
    if text_classifier is None:
        return fallback_text_safety(text)

    try:
        result = text_classifier(text[:512])
        scores = {}

        if isinstance(result, list) and len(result) > 0 and isinstance(result[0], list):
            rows = result[0]
        else:
            rows = result

        for item in rows:
            label = item["label"].lower()
            scores[label] = float(item["score"])

        toxic_score = scores.get("toxic", 0.0)
        severe_toxic_score = scores.get("severe_toxic", 0.0)
        obscene_score = scores.get("obscene", 0.0)
        threat_score = scores.get("threat", 0.0)
        insult_score = scores.get("insult", 0.0)
        identity_hate_score = scores.get("identity_hate", 0.0)

        critical = (
            severe_toxic_score >= 0.60
            or threat_score >= 0.50
            or identity_hate_score >= 0.50
        )

        unsafe = (
            toxic_score >= 0.70
            or severe_toxic_score >= 0.60
            or threat_score >= 0.50
            or identity_hate_score >= 0.50
            or insult_score >= 0.80
            or obscene_score >= 0.80
        )

        if unsafe:
            return {
                "safe": False,
                "confidence": round(max(scores.values()) if scores else 0.8, 4),
                "critical_violation": critical,
                "explanation_code": "UNSAFE_TEXT_DETECTED",
                "details": {
                    "scores": scores,
                    "mode": "unitary/toxic-bert",
                },
            }

        return {
            "safe": True,
            "confidence": round(1.0 - max(scores.values()) if scores else 0.8, 4),
            "critical_violation": False,
            "explanation_code": "TEXT_SAFE",
            "details": {
                "scores": scores,
                "mode": "unitary/toxic-bert",
            },
        }

    except Exception as e:
        fallback = fallback_text_safety(text)
        fallback["details"]["ai_error"] = str(e)
        return fallback


def image_safety(media: List[MediaItem]) -> Dict[str, Any]:
    if not media:
        return {
            "safe": True,
            "confidence": 1.0,
            "critical_violation": False,
            "explanation_code": "NO_IMAGE_PROVIDED",
            "details": {"images": []},
        }

    image_results = []
    max_nsfw_score = 0.0

    for item in media:
        image = decode_image(item)

        if image is None:
            return {
                "safe": False,
                "confidence": 1.0,
                "critical_violation": True,
                "explanation_code": "CORRUPTED_IMAGE",
                "details": {"file_name": item.file_name},
            }

        if image_classifier is None:
            image_results.append(
                {
                    "file_name": item.file_name,
                    "mode": "basic_decode_only",
                    "safe": True,
                    "nsfw_score": 0.0,
                }
            )
            continue

        try:
            outputs = image_classifier(image)
            labels = {row["label"].lower(): float(row["score"]) for row in outputs}

            nsfw_score = max(
                labels.get("nsfw", 0.0),
                labels.get("porn", 0.0),
                labels.get("sexy", 0.0),
                labels.get("hentai", 0.0),
            )

            max_nsfw_score = max(max_nsfw_score, nsfw_score)

            image_results.append(
                {
                    "file_name": item.file_name,
                    "labels": labels,
                    "nsfw_score": nsfw_score,
                    "safe": nsfw_score < 0.70,
                    "mode": "Falconsai/nsfw_image_detection",
                }
            )

        except Exception as e:
            image_results.append(
                {
                    "file_name": item.file_name,
                    "safe": True,
                    "nsfw_score": 0.0,
                    "mode": "model_failed_decode_passed",
                    "error": str(e),
                }
            )

    unsafe_images = [img for img in image_results if img.get("safe") is False]

    if unsafe_images:
        return {
            "safe": False,
            "confidence": round(max_nsfw_score, 4),
            "critical_violation": True,
            "explanation_code": "UNSAFE_IMAGE_DETECTED",
            "details": {"images": image_results},
        }

    return {
        "safe": True,
        "confidence": round(1.0 - max_nsfw_score, 4),
        "critical_violation": False,
        "explanation_code": "IMAGES_SAFE",
        "details": {"images": image_results},
    }


@app.post("/analyze")
def analyze(payload: OracleRequest):
    text = payload.metadata.get("text", "")

    text_result = ai_text_safety(text)
    image_result = image_safety(payload.media)

    if not text_result["safe"]:
        vote = "REJECT"
        explanation = text_result["explanation_code"]
        confidence = text_result["confidence"]
        critical = text_result["critical_violation"]
    elif not image_result["safe"]:
        vote = "REJECT"
        explanation = image_result["explanation_code"]
        confidence = image_result["confidence"]
        critical = image_result["critical_violation"]
    else:
        vote = "ACCEPT"
        explanation = "TEXT_AND_IMAGES_SAFE"
        confidence = min(text_result["confidence"], image_result["confidence"])
        critical = False

    logger.info(
        "Decision=%s confidence=%s reason=%s critical=%s details=%s",
        vote,
        round(float(confidence), 4),
        explanation,
        critical,
        {"text_result": text_result, "image_result": image_result},
    )

    return {
        "oracle_id": "ORACLE_1_SAFETY",
        "vote": vote,
        "confidence": round(float(confidence), 4),
        "explanation_code": explanation,
        "model_name": "unitary/toxic-bert + Falconsai/nsfw_image_detection",
        "model_version": "1.0.0",
        "critical_violation": critical,
        "details": {
            "text_result": text_result,
            "image_result": image_result,
        },
    }
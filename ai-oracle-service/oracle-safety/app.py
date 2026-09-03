import base64
import hashlib
import io
import logging
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image

app = FastAPI(title="Oracle 1 - Safety Oracle")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("oracle-safety")

ENABLE_AI_MODELS = os.getenv("ENABLE_AI_MODELS", "true").lower() == "true"
ENABLE_FACE_BLURRING = os.getenv("ENABLE_FACE_BLURRING", "true").lower() == "true"
FACE_DETECTOR_MODEL_PATH = Path(
    os.getenv(
        "FACE_DETECTOR_MODEL_PATH",
        str(Path(__file__).resolve().parent / "models" / "face_detection_yunet_2023mar.onnx"),
    )
)
FACE_DETECTION_SCORE_THRESHOLD = float(
    os.getenv("FACE_DETECTION_SCORE_THRESHOLD", "0.90")
)
FACE_DETECTION_NMS_THRESHOLD = float(
    os.getenv("FACE_DETECTION_NMS_THRESHOLD", "0.30")
)
FACE_DETECTION_MAX_DIMENSION = int(
    os.getenv("FACE_DETECTION_MAX_DIMENSION", "1280")
)
FACE_MIN_SIZE_PX = int(os.getenv("FACE_MIN_SIZE_PX", "20"))
FACE_BLUR_MARGIN_RATIO = float(os.getenv("FACE_BLUR_MARGIN_RATIO", "0.15"))
FACE_DETECTION_FAIL_CLOSED = (
    os.getenv("FACE_DETECTION_FAIL_CLOSED", "true").lower() == "true"
)

text_classifier = None
image_classifier = None
face_detector = None
face_detector_lock = threading.Lock()


def load_face_detector():
    global face_detector

    if not ENABLE_FACE_BLURRING:
        return None
    if not FACE_DETECTOR_MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"YuNet face detector model not found: {FACE_DETECTOR_MODEL_PATH}"
        )

    import cv2

    face_detector = cv2.FaceDetectorYN.create(
        str(FACE_DETECTOR_MODEL_PATH),
        "",
        (320, 320),
        FACE_DETECTION_SCORE_THRESHOLD,
        FACE_DETECTION_NMS_THRESHOLD,
        5000,
    )
    return face_detector


def _get_face_detector():
    if face_detector is None:
        return load_face_detector()
    return face_detector


def detect_faces(pil_image: Image.Image) -> List[Dict[str, Any]]:
    import cv2
    import numpy as np

    image_rgb = np.array(pil_image.convert("RGB"))
    image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    image_height, image_width = image_bgr.shape[:2]

    longest_side = max(image_width, image_height)
    scale = min(1.0, FACE_DETECTION_MAX_DIMENSION / max(longest_side, 1))
    if scale < 1.0:
        detection_image = cv2.resize(
            image_bgr,
            (
                max(1, round(image_width * scale)),
                max(1, round(image_height * scale)),
            ),
            interpolation=cv2.INTER_AREA,
        )
    else:
        detection_image = image_bgr

    detection_height, detection_width = detection_image.shape[:2]
    detector = _get_face_detector()
    with face_detector_lock:
        detector.setInputSize((detection_width, detection_height))
        _, rows = detector.detect(detection_image)

    if rows is None:
        return []

    inverse_scale = 1.0 / scale
    detections = []
    for row in rows:
        x, y, width, height = (
            float(row[0]) * inverse_scale,
            float(row[1]) * inverse_scale,
            float(row[2]) * inverse_scale,
            float(row[3]) * inverse_scale,
        )
        score = float(row[14])

        x1 = max(0.0, x)
        y1 = max(0.0, y)
        x2 = min(float(image_width), x + width)
        y2 = min(float(image_height), y + height)
        clipped_width = x2 - x1
        clipped_height = y2 - y1

        if clipped_width < FACE_MIN_SIZE_PX or clipped_height < FACE_MIN_SIZE_PX:
            continue

        aspect_ratio = clipped_width / max(clipped_height, 1.0)
        if not 0.5 <= aspect_ratio <= 1.8:
            continue

        landmarks = [
            {
                "x": round(float(row[index]) * inverse_scale, 2),
                "y": round(float(row[index + 1]) * inverse_scale, 2),
            }
            for index in range(4, 14, 2)
        ]
        detections.append(
            {
                "box": {
                    "x": round(x1, 2),
                    "y": round(y1, 2),
                    "width": round(clipped_width, 2),
                    "height": round(clipped_height, 2),
                },
                "score": round(score, 4),
                "landmarks": landmarks,
            }
        )

    return detections


def blur_faces(
    pil_image: Image.Image,
) -> tuple[Image.Image, List[Dict[str, Any]]]:
    import cv2
    import numpy as np

    detections = detect_faces(pil_image)
    if not detections:
        return pil_image, []

    image_rgb = np.array(pil_image.convert("RGB"))
    image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    image_height, image_width = image_bgr.shape[:2]

    for detection in detections:
        box = detection["box"]
        x, y, width, height = (
            int(box["x"]),
            int(box["y"]),
            int(box["width"]),
            int(box["height"]),
        )
        margin_x = int(width * FACE_BLUR_MARGIN_RATIO)
        margin_y = int(height * FACE_BLUR_MARGIN_RATIO)
        x1 = max(0, x - margin_x)
        y1 = max(0, y - margin_y)
        x2 = min(image_width, x + width + margin_x)
        y2 = min(image_height, y + height + margin_y)

        if x2 <= x1 or y2 <= y1:
            continue

        face_roi = image_bgr[y1:y2, x1:x2]
        kernel_width = max(15, int((x2 - x1) / 3) | 1)
        kernel_height = max(15, int((y2 - y1) / 3) | 1)
        image_bgr[y1:y2, x1:x2] = cv2.GaussianBlur(
            face_roi, (kernel_width, kernel_height), 0
        )

    logger.info(
        "[Face Blurring] detector=yunet faces_detected=%s blur_applied=true",
        len(detections),
    )
    return Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)), detections


def encode_image(image: Image.Image, mime_type: str) -> Optional[tuple[str, str, int]]:
    try:
        pil_format = "JPEG"
        if "png" in mime_type.lower():
            pil_format = "PNG"
        elif "webp" in mime_type.lower():
            pil_format = "WEBP"

        buffered = io.BytesIO()
        image.save(buffered, format=pil_format)
        img_bytes = buffered.getvalue()

        b64_str = base64.b64encode(img_bytes).decode("utf-8")
        sha256_hash = hashlib.sha256(img_bytes).hexdigest()
        size_bytes = len(img_bytes)

        return b64_str, sha256_hash, size_bytes
    except Exception as e:
        logger.error(f"[Face Blurring] Encoding image failed: {e}")
        return None


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
    if ENABLE_FACE_BLURRING:
        try:
            load_face_detector()
            logger.info(
                "[Face Detection] detector=yunet model=%s score_threshold=%.2f "
                "nms_threshold=%.2f",
                FACE_DETECTOR_MODEL_PATH,
                FACE_DETECTION_SCORE_THRESHOLD,
                FACE_DETECTION_NMS_THRESHOLD,
            )
        except Exception:
            logger.exception("[Face Detection] YuNet initialization failed")


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

    critical_words = [
        "kill",
        "bomb",
        "attack",
        "terrorist",
        "murder",
        "assassinate",
        "massacre",
        "shoot",
        "stabbing",
        "hostage",
        "explosive",
        "suicide",
        "decapitate",
        "poison",
        "genocide",
        "execute",
    ]

    toxic_words = [
        "idiot",
        "stupid",
        "moron",
        "hate",
        "racist",
        "threat",
        "criminal",
        "criminals",
        "forced out",
        "discriminatory",
        "discrimination",
        "harass",
        "harassment",
        "abuse",
        "slur",
        "xenophobic",
        "bigot",
        "scum",
        "subhuman",
        "deport",
        "expel",
        "ethnics",
        "parasite",
        "vermin",
        "disgusting",
        "vile",
        "trash",
        "assault",
        "scammer",
        "threaten",
        "violence",
        "extremist",
    ]

    hate_phrases = [
        "hate all",
        "hate people",
        "force them out",
        "forced out",
        "kick them out",
        "get rid of",
        "send them back",
        "dirty people",
        "destroy them",
        "go back to",
        "all criminals",
        "they are criminals",
        "not welcome here",
    ]

    critical_matches = [word for word in critical_words if word in lower]
    toxic_matches = [word for word in toxic_words if word in lower]
    hate_phrase_matches = [phrase for phrase in hate_phrases if phrase in lower]

    if critical_matches:
        return {
            "safe": False,
            "confidence": 0.95,
            "critical_violation": True,
            "explanation_code": "CRITICAL_THREAT_DETECTED",
            "details": {
                "critical_matches": critical_matches,
                "toxic_matches": toxic_matches,
                "hate_phrase_matches": hate_phrase_matches,
                "mode": "fallback_rules",
            },
        }

    is_hate_speech = (
        len(toxic_matches) >= 2
        or len(hate_phrase_matches) >= 1
        or ("hate" in lower and any(w in lower for w in ["people", "them", "neighborhood", "group", "criminals", "forced out", "community", "minority"]))
        or ("criminals" in lower and "forced out" in lower)
    )

    if is_hate_speech:
        return {
            "safe": False,
            "confidence": 0.90,
            "critical_violation": True,
            "explanation_code": "TOXIC_LANGUAGE_DETECTED",
            "details": {
                "critical_matches": critical_matches,
                "toxic_matches": toxic_matches,
                "hate_phrase_matches": hate_phrase_matches,
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
            "hate_phrase_matches": hate_phrase_matches,
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
            severe_toxic_score >= 0.50
            or threat_score >= 0.40
            or identity_hate_score >= 0.40
        )

        unsafe = (
            toxic_score >= 0.50
            or severe_toxic_score >= 0.50
            or threat_score >= 0.40
            or identity_hate_score >= 0.40
            or insult_score >= 0.60
            or obscene_score >= 0.60
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

        # 1. Run NSFW safety checks first
        nsfw_score = 0.0
        is_safe = True
        labels = {}
        mode = "basic_decode_only"

        if image_classifier is not None:
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
                is_safe = nsfw_score < 0.70
                mode = "Falconsai/nsfw_image_detection"
            except Exception as e:
                logger.error(f"[Safety Oracle] NSFW check failed: {e}")
                mode = "model_failed_decode_passed"
                is_safe = True
        elif any(k in item.file_name.lower() for k in ["nsfw", "nudity", "porn", "explicit"]):
            nsfw_score = 0.95
            max_nsfw_score = max(max_nsfw_score, nsfw_score)
            is_safe = False
            mode = "rule_based_nsfw_indicator"

        # 2. Block/Reject if image is NSFW
        if not is_safe:
            image_results.append(
                {
                    "file_name": item.file_name,
                    "labels": labels,
                    "nsfw_score": nsfw_score,
                    "safe": False,
                    "mode": mode,
                }
            )
            continue

        face_detections = []
        blur_applied = False
        face_detection_error = None

        # 3. If safe and face blurring is enabled, detect and blur faces
        if ENABLE_FACE_BLURRING:
            try:
                blurred_image, face_detections = blur_faces(image)
                if face_detections:
                    encoded = encode_image(blurred_image, item.mime_type)
                    if encoded:
                        item.base64, item.sha256, item.size_bytes = encoded
                        blur_applied = True
                        logger.info(
                            "[Face Blurring] file=%s faces_detected=%s "
                            "new_size_bytes=%s",
                            item.file_name,
                            len(face_detections),
                            item.size_bytes,
                        )
                    else:
                        face_detection_error = "blurred_image_encoding_failed"
                else:
                    logger.info(
                        "[Face Blurring] file=%s faces_detected=0 "
                        "blur_applied=false",
                        item.file_name,
                    )
            except Exception as e:
                face_detection_error = str(e)
                logger.exception(
                    "[Face Blurring] file=%s detection_failed", item.file_name
                )

        image_results.append(
            {
                "file_name": item.file_name,
                "labels": labels,
                "nsfw_score": nsfw_score,
                "safe": not (
                    FACE_DETECTION_FAIL_CLOSED and face_detection_error is not None
                ),
                "mode": mode,
                "face_detection": {
                    "detector": "yunet",
                    "faces_detected": len(face_detections),
                    "blur_applied": blur_applied,
                    "detections": face_detections,
                    "error": face_detection_error,
                },
            }
        )

    face_processing_failures = [
        img
        for img in image_results
        if img.get("face_detection", {}).get("error") is not None
    ]
    unsafe_images = [
        img
        for img in image_results
        if img.get("safe") is False and img not in face_processing_failures
    ]

    if unsafe_images:
        return {
            "safe": False,
            "confidence": round(max_nsfw_score, 4),
            "critical_violation": True,
            "explanation_code": "UNSAFE_IMAGE_DETECTED",
            "details": {"images": image_results},
        }

    if face_processing_failures and FACE_DETECTION_FAIL_CLOSED:
        return {
            "safe": False,
            "confidence": 1.0,
            "critical_violation": False,
            "explanation_code": "FACE_DETECTION_FAILED",
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

    blurred_media_list = []
    if vote == "ACCEPT" and ENABLE_FACE_BLURRING:
        image_details = image_result.get("details", {}).get("images", [])
        for item, detail in zip(payload.media, image_details):
            if not detail.get("face_detection", {}).get("blur_applied"):
                continue
            blurred_media_list.append(
                {
                    "file_name": item.file_name,
                    "mime_type": item.mime_type,
                    "sha256": item.sha256,
                    "base64": item.base64,
                    "size_bytes": item.size_bytes,
                }
            )

    return {
        "oracle_id": "ORACLE_1_SAFETY",
        "vote": vote,
        "confidence": round(float(confidence), 4),
        "explanation_code": explanation,
        "model_name": (
            "unitary/toxic-bert + Falconsai/nsfw_image_detection + "
            "OpenCV YuNet face_detection_yunet_2023mar"
        ),
        "model_version": "1.1.0",
        "critical_violation": critical,
        "details": {
            "text_result": text_result,
            "image_result": image_result,
        },
        "blurred_media": blurred_media_list if blurred_media_list else None,
    }

import base64
import hashlib
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
ENABLE_FACE_BLURRING = os.getenv("ENABLE_FACE_BLURRING", "true").lower() == "true"

text_classifier = None
image_classifier = None


def blur_faces(pil_image: Image.Image) -> Image.Image:
    try:
        import cv2
        import numpy as np

        # Convert PIL Image to OpenCV BGR
        img = np.array(pil_image.convert("RGB"))
        img_bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        img_height, img_width = gray.shape

        # Load cascade classifiers (default frontal, alt frontal, alt2 frontal, profile)
        frontal_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        alt_path = cv2.data.haarcascades + "haarcascade_frontalface_alt.xml"
        alt2_path = cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml"
        profile_path = cv2.data.haarcascades + "haarcascade_profileface.xml"

        frontal_cascade = cv2.CascadeClassifier(frontal_path)
        alt_cascade = cv2.CascadeClassifier(alt_path)
        alt2_cascade = cv2.CascadeClassifier(alt2_path)
        profile_cascade = cv2.CascadeClassifier(profile_path)

        raw_boxes = []

        # 1. Frontal & angled face detection
        for cascade in [frontal_cascade, alt_cascade, alt2_cascade]:
            faces = cascade.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3, minSize=(20, 20))
            if isinstance(faces, np.ndarray) and len(faces) > 0:
                raw_boxes.extend(faces.tolist())

        # 2. Left-profile face detection
        profiles_left = profile_cascade.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3, minSize=(20, 20))
        if isinstance(profiles_left, np.ndarray) and len(profiles_left) > 0:
            raw_boxes.extend(profiles_left.tolist())

        # 3. Right-profile face detection (haarcascade_profileface is asymmetric, requires horizontal flip)
        flipped_gray = cv2.flip(gray, 1)
        profiles_right = profile_cascade.detectMultiScale(flipped_gray, scaleFactor=1.05, minNeighbors=3, minSize=(20, 20))
        if isinstance(profiles_right, np.ndarray) and len(profiles_right) > 0:
            for (fx, fy, fw, fh) in profiles_right:
                orig_x = img_width - fx - fw
                raw_boxes.append([orig_x, fy, fw, fh])

        if not raw_boxes:
            return pil_image

        # Deduplicate overlapping bounding boxes using Non-Maximum Suppression (NMS)
        rects = np.array([[x, y, x + w, y + h] for (x, y, w, h) in raw_boxes])
        pick = []
        x1 = rects[:, 0]
        y1 = rects[:, 1]
        x2 = rects[:, 2]
        y2 = rects[:, 3]
        area = (x2 - x1 + 1) * (y2 - y1 + 1)
        idxs = np.argsort(y2)

        while len(idxs) > 0:
            last = len(idxs) - 1
            i = idxs[last]
            pick.append(i)
            xx1 = np.maximum(x1[i], x1[idxs[:last]])
            yy1 = np.maximum(y1[i], y1[idxs[:last]])
            xx2 = np.minimum(x2[i], x2[idxs[:last]])
            yy2 = np.minimum(y2[i], y2[idxs[:last]])
            w = np.maximum(0, xx2 - xx1 + 1)
            h = np.maximum(0, yy2 - yy1 + 1)
            overlap = (w * h) / area[idxs[:last]]
            idxs = np.delete(idxs, np.concatenate(([last], np.where(overlap > 0.4)[0])))

        final_boxes = rects[pick]
        logger.info(f"[Face Blurring] Detected & consolidated {len(final_boxes)} 360° multi-angle faces.")

        for (x1_b, y1_b, x2_b, y2_b) in final_boxes:
            x1_b = max(0, x1_b)
            y1_b = max(0, y1_b)
            x2_b = min(img_width, x2_b)
            y2_b = min(img_height, y2_b)
            w = x2_b - x1_b
            h = y2_b - y1_b

            if w <= 0 or h <= 0:
                continue

            face_roi = img_bgr[y1_b:y2_b, x1_b:x2_b]

            ksize_w = int(w / 2.5) | 1
            ksize_h = int(h / 2.5) | 1
            ksize_w = max(19, ksize_w)
            ksize_h = max(19, ksize_h)

            blurred_face = cv2.GaussianBlur(face_roi, (ksize_w, ksize_h), 0)
            img_bgr[y1_b:y2_b, x1_b:x2_b] = blurred_face

        # Convert back to PIL Image
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        return Image.fromarray(img_rgb)
    except Exception as e:
        logger.error(f"[Face Blurring] Face blurring failed with error: {e}")
        return pil_image


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

        # 3. If safe and face blurring is enabled, detect and blur faces
        if ENABLE_FACE_BLURRING:
            blurred_image = blur_faces(image)
            encoded = encode_image(blurred_image, item.mime_type)
            if encoded:
                item.base64, item.sha256, item.size_bytes = encoded
                logger.info(f"[Face Blurring] Image {item.file_name} blurred. New size: {item.size_bytes} bytes.")

        image_results.append(
            {
                "file_name": item.file_name,
                "labels": labels,
                "nsfw_score": nsfw_score,
                "safe": True,
                "mode": mode,
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

    blurred_media_list = []
    if vote == "ACCEPT" and ENABLE_FACE_BLURRING:
        for item in payload.media:
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
        "model_name": "unitary/toxic-bert + Falconsai/nsfw_image_detection",
        "model_version": "1.0.0",
        "critical_violation": critical,
        "details": {
            "text_result": text_result,
            "image_result": image_result,
        },
        "blurred_media": blurred_media_list if blurred_media_list else None,
    }
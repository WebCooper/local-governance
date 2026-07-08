import logging
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Oracle 2 - Spam and Abuse Oracle")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("oracle-spam")

ENABLE_SPAM_AI_MODEL = os.getenv("ENABLE_SPAM_AI_MODEL", "true").lower() == "true"
SPAM_MODEL_NAME = os.getenv(
    "SPAM_MODEL_NAME",
    "mrm8488/bert-tiny-finetuned-sms-spam-detection",
)

# Thresholds for hybrid spam decision
AI_STRONG_SPAM_THRESHOLD = float(os.getenv("AI_STRONG_SPAM_THRESHOLD", "0.85"))
AI_SUPPORTING_SPAM_THRESHOLD = float(os.getenv("AI_SUPPORTING_SPAM_THRESHOLD", "0.65"))
RULE_REJECT_THRESHOLD = float(os.getenv("RULE_REJECT_THRESHOLD", "0.60"))
RULE_SUPPORT_THRESHOLD = float(os.getenv("RULE_SUPPORT_THRESHOLD", "0.25"))

spam_classifier = None


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


SPAM_PHRASES = [
    "buy now",
    "free money",
    "click here",
    "limited offer",
    "earn fast",
    "crypto giveaway",
    "lottery winner",
    "work from home",
    "guaranteed income",
    "subscribe now",
    "claim your reward",
    "win cash",
    "winner selected",
    "exclusive deal",
]

PROMOTIONAL_WORDS = [
    "discount",
    "promotion",
    "offer",
    "sale",
    "coupon",
    "deal",
    "sponsor",
    "reward",
    "prize",
    "bonus",
]

URL_REGEX = re.compile(r"(https?://|www\.)", re.IGNORECASE)


@app.on_event("startup")
def load_spam_model() -> None:
    global spam_classifier

    if not ENABLE_SPAM_AI_MODEL:
        logger.info("Spam AI model is disabled. Using rule-based spam checks only.")
        spam_classifier = None
        return

    try:
        from transformers import pipeline

        logger.info("Loading spam NLP model: %s", SPAM_MODEL_NAME)

        spam_classifier = pipeline(
            "text-classification",
            model=SPAM_MODEL_NAME,
            tokenizer=SPAM_MODEL_NAME,
        )

        logger.info("Spam NLP model loaded successfully.")

    except Exception as exc:
        logger.exception(
            "Failed to load spam NLP model. Falling back to rule-based spam checks. Error: %s",
            str(exc),
        )
        spam_classifier = None


@app.get("/")
def root():
    return {
        "oracle_id": "ORACLE_2_SPAM_ABUSE",
        "status": "running",
        "ai_model_enabled": ENABLE_SPAM_AI_MODEL,
        "ai_model_loaded": spam_classifier is not None,
        "model_name": SPAM_MODEL_NAME if spam_classifier is not None else "rules-only",
    }


def repeated_character_pattern(text: str) -> bool:
    return bool(re.search(r"(.)\1{6,}", text))


def excessive_symbols(text: str) -> bool:
    symbol_count = sum(1 for char in text if char in "!@#$%^&*_=+~")
    return symbol_count > 10


def analyze_rule_based_spam(text: str) -> Dict[str, Any]:
    lower = text.lower().strip()
    words = [word for word in re.split(r"\s+", lower) if word]

    word_count = len(words)
    url_count = len(URL_REGEX.findall(lower))

    matched_spam_phrases = [phrase for phrase in SPAM_PHRASES if phrase in lower]
    matched_promotional_words = [word for word in PROMOTIONAL_WORDS if word in lower]

    repeated_chars = repeated_character_pattern(lower)
    symbols = excessive_symbols(lower)

    reasons = []
    score = 0.0

    if word_count < 5:
        reasons.append("TOO_SHORT")
        score += 0.35

    if matched_spam_phrases:
        reasons.append("SPAM_PHRASE_DETECTED")
        score += 0.80

    if matched_promotional_words:
        reasons.append("PROMOTIONAL_LANGUAGE_DETECTED")
        score += 0.35

    if url_count > 1:
        reasons.append("MULTIPLE_URLS_DETECTED")
        score += 0.60
    elif url_count == 1:
        reasons.append("URL_DETECTED")
        score += 0.25

    if repeated_chars:
        reasons.append("REPEATED_CHARACTER_PATTERN")
        score += 0.50

    if symbols:
        reasons.append("EXCESSIVE_SYMBOLS")
        score += 0.40

    spam_score = min(score, 1.0)

    return {
        "spam_score": round(spam_score, 4),
        "word_count": word_count,
        "url_count": url_count,
        "matched_spam_phrases": matched_spam_phrases,
        "matched_promotional_words": matched_promotional_words,
        "repeated_character_pattern": repeated_chars,
        "excessive_symbols": symbols,
        "reasons": reasons,
    }


def analyze_ai_spam(text: str) -> Dict[str, Any]:
    if spam_classifier is None:
        return {
            "model_used": False,
            "available": False,
            "label": None,
            "spam_probability": None,
            "non_spam_probability": None,
            "raw_output": None,
            "error": "AI model unavailable or disabled.",
        }

    try:
        # The model returns either LABEL_0 or LABEL_1 as the top predicted class.
        # LABEL_0 = non-spam, LABEL_1 = spam.
        prediction = spam_classifier(text, truncation=True, max_length=512)[0]

        predicted_label = prediction.get("label")
        predicted_score = float(prediction.get("score", 0.0))

        if predicted_label == "LABEL_1":
            spam_probability = predicted_score
            non_spam_probability = round(1.0 - predicted_score, 4)
        elif predicted_label == "LABEL_0":
            spam_probability = round(1.0 - predicted_score, 4)
            non_spam_probability = predicted_score
        else:
            # Defensive fallback in case model labels change in the future.
            spam_probability = None
            non_spam_probability = None

        return {
            "model_used": True,
            "available": True,
            "label": predicted_label,
            "predicted_score": round(predicted_score, 4),
            "spam_probability": round(spam_probability, 4)
            if spam_probability is not None
            else None,
            "non_spam_probability": round(non_spam_probability, 4)
            if non_spam_probability is not None
            else None,
            "raw_output": prediction,
            "error": None,
        }

    except Exception as exc:
        logger.exception("Spam AI inference failed: %s", str(exc))

        return {
            "model_used": False,
            "available": False,
            "label": None,
            "spam_probability": None,
            "non_spam_probability": None,
            "raw_output": None,
            "error": str(exc),
        }


def combine_spam_signals(
    rule_result: Dict[str, Any],
    ai_result: Dict[str, Any],
) -> Dict[str, Any]:
    rule_score = float(rule_result["spam_score"])
    ai_spam_probability = ai_result.get("spam_probability")

    rejection_reasons = []

    if ai_spam_probability is not None and ai_spam_probability >= AI_STRONG_SPAM_THRESHOLD:
        rejection_reasons.append("AI_STRONG_SPAM_DETECTION")

    if rule_score >= RULE_REJECT_THRESHOLD:
        rejection_reasons.append("RULE_BASED_SPAM_DETECTION")

    if (
        ai_spam_probability is not None
        and ai_spam_probability >= AI_SUPPORTING_SPAM_THRESHOLD
        and rule_score >= RULE_SUPPORT_THRESHOLD
    ):
        rejection_reasons.append("AI_AND_RULES_JOINT_SPAM_DETECTION")

    is_spam = len(rejection_reasons) > 0

    if is_spam:
        if ai_spam_probability is not None:
            confidence = max(ai_spam_probability, rule_score)
        else:
            confidence = rule_score

        return {
            "is_spam": True,
            "confidence": round(min(confidence, 1.0), 4),
            "explanation_code": "SPAM_OR_LOW_QUALITY_DETECTED",
            "rejection_reasons": rejection_reasons,
        }

    if ai_spam_probability is not None:
        confidence = 1.0 - ai_spam_probability
    else:
        confidence = 1.0 - rule_score

    return {
        "is_spam": False,
        "confidence": round(max(min(confidence, 1.0), 0.0), 4),
        "explanation_code": "NO_SPAM_DETECTED",
        "rejection_reasons": [],
    }


def analyze_spam(text: str) -> Dict[str, Any]:
    rule_result = analyze_rule_based_spam(text)
    ai_result = analyze_ai_spam(text)
    combined_result = combine_spam_signals(rule_result, ai_result)

    return {
        "is_spam": combined_result["is_spam"],
        "confidence": combined_result["confidence"],
        "explanation_code": combined_result["explanation_code"],
        "details": {
            "decision_logic": {
                "ai_strong_spam_threshold": AI_STRONG_SPAM_THRESHOLD,
                "ai_supporting_spam_threshold": AI_SUPPORTING_SPAM_THRESHOLD,
                "rule_reject_threshold": RULE_REJECT_THRESHOLD,
                "rule_support_threshold": RULE_SUPPORT_THRESHOLD,
                "rejection_reasons": combined_result["rejection_reasons"],
            },
            "ai_analysis": ai_result,
            "rule_based_analysis": rule_result,
        },
    }


@app.post("/analyze")
def analyze(payload: OracleRequest):
    text = payload.metadata.get("text", "")
    result = analyze_spam(text)

    vote = "REJECT" if result["is_spam"] else "ACCEPT"

    logger.info(
        "Decision=%s confidence=%s reason=%s details=%s",
        vote,
        result["confidence"],
        result["explanation_code"],
        result["details"],
    )

    return {
        "oracle_id": "ORACLE_2_SPAM_ABUSE",
        "vote": vote,
        "confidence": result["confidence"],
        "explanation_code": result["explanation_code"],
        "model_name": (
            f"{SPAM_MODEL_NAME} + spam-abuse-rules-v2"
            if spam_classifier is not None
            else "spam-abuse-rules-v2"
        ),
        "model_version": "2.0.0",
        "critical_violation": False,
        "details": result["details"],
    }
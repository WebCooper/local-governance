import base64
import io
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI
from PIL import Image

app = FastAPI(title="Oracle 3 - Civic Relevance Oracle")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("oracle-civic")

# ---------------------------------------------------------------------
# Environment Configuration
# ---------------------------------------------------------------------

ENABLE_SEMANTIC_TEXT_RELEVANCE = (
    os.getenv("ENABLE_SEMANTIC_TEXT_RELEVANCE", "true").lower() == "true"
)

SEMANTIC_MODEL_NAME = os.getenv(
    "SEMANTIC_MODEL_NAME",
    "sentence-transformers/all-MiniLM-L6-v2",
)

# Threshold used to decide whether a report is semantically civic-relevant.
# You can tune this after running test cases.
TEXT_RELEVANCE_THRESHOLD = float(
    os.getenv("TEXT_RELEVANCE_THRESHOLD", "0.38")
)

# Threshold used only to check whether the selected category semantically matches
# the text. A category mismatch does not reject the report if the text is still civic.
CATEGORY_MATCH_THRESHOLD = float(
    os.getenv("CATEGORY_MATCH_THRESHOLD", "0.40")
)

# Civic image relevance is not currently evaluated in this version.
ENABLE_CLIP_RELEVANCE = (
    os.getenv("ENABLE_CLIP_RELEVANCE", "false").lower() == "true"
)

semantic_model = None
reference_embeddings = None
flat_reference_entries: List[Dict[str, str]] = []


# ---------------------------------------------------------------------
# Civic Reference Descriptions
# ---------------------------------------------------------------------

# These references are used to semantically compare report text
# against known civic/local-governance issue types.
CIVIC_REFERENCE_TEXTS = {
    "Road Damage": [
        "A civic report about potholes, damaged roads, broken streets, or unsafe road surfaces.",
        "A public complaint about a road hole, cracked road, damaged bridge, or pedestrian sidewalk problem.",
        "A local government issue involving road repair or damaged transport infrastructure.",
    ],
    "Waste Management": [
        "A civic report about uncollected garbage, waste dumping, overflowing bins, or rubbish on public streets.",
        "A public sanitation complaint related to trash accumulation, waste disposal, or garbage collection failure.",
        "A local government issue involving garbage removal or illegal waste dumping.",
    ],
    "Streetlight Issue": [
        "A civic report about broken streetlights, dark public roads, damaged lamp posts, or lighting failures.",
        "A public infrastructure complaint involving non-functioning road lights or unsafe darkness at night.",
        "A local government issue related to public street lighting.",
    ],
    "Drainage / Sewage": [
        "A civic report about blocked drains, overflowing drainage, sewage leaks, or wastewater problems.",
        "A public health complaint involving drainage failure, dirty wastewater, or blocked canals.",
        "A local government issue related to sewage or stormwater drainage.",
    ],
    "Water Supply": [
        "A civic report about leaking water pipes, broken public taps, water supply interruption, or water distribution problems.",
        "A complaint about a public water leak, pipe burst, or unavailable water service.",
        "A local governance issue related to water infrastructure.",
    ],
    "Flooding": [
        "A civic report about flooded roads, waterlogged streets, rainwater accumulation, or urban flooding.",
        "A public complaint involving floodwater blocking transportation or damaging the area.",
        "A local government issue caused by heavy rain and standing water in public places.",
    ],
    "Public Property Damage": [
        "A civic report about damaged public benches, broken signboards, vandalized parks, or damaged public buildings.",
        "A complaint about destruction or poor maintenance of community-owned property.",
        "A local government issue involving damaged public facilities.",
    ],
    "Traffic / Road Safety": [
        "A civic report about dangerous traffic conditions, broken signals, unsafe crossings, or accident-prone public roads.",
        "A public safety complaint involving road signs, pedestrian crossings, signals, or traffic risk.",
        "A local government issue related to traffic control and road safety.",
    ],
    "Environmental Issue": [
        "A civic report about pollution, smoke, chemical discharge, noise pollution, dirty rivers, or environmental harm.",
        "A complaint about public environmental damage affecting the community.",
        "A local governance issue related to pollution or environmental protection.",
    ],
    "General Civic Issue": [
        "A report about a public issue that should be addressed by local authorities.",
        "A civic complaint involving community infrastructure, public safety, sanitation, or public services.",
        "A local governance report submitted by a citizen for government attention.",
    ],
}


# Existing keyword logic is retained as supporting details and as fallback
# when the semantic model is disabled or unavailable.
CIVIC_KEYWORDS = {
    "Road Damage": [
        "road",
        "pothole",
        "bridge",
        "sidewalk",
        "street",
        "crack",
        "hole",
        "damaged road",
    ],
    "Waste Management": [
        "garbage",
        "waste",
        "trash",
        "dump",
        "bin",
        "rubbish",
        "litter",
    ],
    "Streetlight Issue": [
        "streetlight",
        "lamp",
        "light",
        "dark",
        "pole",
        "street light",
    ],
    "Drainage / Sewage": [
        "drain",
        "drainage",
        "sewage",
        "canal",
        "blocked",
        "overflow",
        "wastewater",
    ],
    "Water Supply": [
        "water",
        "pipe",
        "leak",
        "supply",
        "tap",
        "burst pipe",
    ],
    "Flooding": [
        "flood",
        "waterlogged",
        "rain",
        "overflow",
        "standing water",
    ],
    "Public Property Damage": [
        "broken",
        "damaged",
        "park",
        "bench",
        "sign",
        "public",
        "vandalized",
    ],
    "Traffic / Road Safety": [
        "traffic",
        "accident",
        "crossing",
        "signal",
        "vehicle",
        "unsafe road",
    ],
    "Environmental Issue": [
        "pollution",
        "smoke",
        "tree",
        "river",
        "chemical",
        "noise",
    ],
    "General Civic Issue": [
        "public",
        "community",
        "government",
        "municipal",
        "issue",
        "problem",
        "authority",
    ],
}


# ---------------------------------------------------------------------
# Startup: Load Semantic Model and Reference Embeddings
# ---------------------------------------------------------------------

def build_flat_reference_entries() -> List[Dict[str, str]]:
    entries = []

    for category, reference_texts in CIVIC_REFERENCE_TEXTS.items():
        for reference_text in reference_texts:
            entries.append(
                {
                    "category": category,
                    "reference_text": reference_text,
                }
            )

    return entries


def load_semantic_model() -> None:
    global semantic_model
    global reference_embeddings
    global flat_reference_entries

    if not ENABLE_SEMANTIC_TEXT_RELEVANCE:
        logger.info(
            "Semantic civic text relevance model disabled. "
            "Using keyword-based fallback only."
        )
        semantic_model = None
        reference_embeddings = None
        flat_reference_entries = []
        return

    try:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading semantic civic relevance model: %s", SEMANTIC_MODEL_NAME)

        semantic_model = SentenceTransformer(SEMANTIC_MODEL_NAME)

        flat_reference_entries = build_flat_reference_entries()

        reference_texts = [
            entry["reference_text"]
            for entry in flat_reference_entries
        ]

        reference_embeddings = semantic_model.encode(
            reference_texts,
            normalize_embeddings=True,
        )

        logger.info(
            "Semantic model loaded successfully. Civic reference embeddings created: %s",
            len(reference_texts),
        )

    except Exception as exc:
        logger.exception(
            "Failed to load semantic civic relevance model. "
            "Falling back to keyword-based relevance. Error: %s",
            str(exc),
        )
        semantic_model = None
        reference_embeddings = None
        flat_reference_entries = []


@app.on_event("startup")
def startup() -> None:
    load_semantic_model()


# ---------------------------------------------------------------------
# Health Endpoint
# ---------------------------------------------------------------------

@app.get("/")
def root():
    return {
        "oracle_id": "ORACLE_3_CIVIC_RELEVANCE",
        "status": "running",
        "semantic_text_relevance_enabled": ENABLE_SEMANTIC_TEXT_RELEVANCE,
        "semantic_text_model_loaded": semantic_model is not None,
        "semantic_model_name": (
            SEMANTIC_MODEL_NAME if semantic_model is not None else "keyword-fallback"
        ),
        "text_relevance_threshold": TEXT_RELEVANCE_THRESHOLD,
        "category_match_threshold": CATEGORY_MATCH_THRESHOLD,
        "clip_relevance_enabled": ENABLE_CLIP_RELEVANCE,
    }


# ---------------------------------------------------------------------
# Image Helpers
# ---------------------------------------------------------------------

def decode_image(media_item: Dict[str, Any]) -> Optional[Image.Image]:
    try:
        raw = base64.b64decode(media_item["base64"])
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        return image
    except Exception:
        return None


def analyze_image_relevance(
    media: List[Dict[str, Any]],
    selected_category: str,
) -> Dict[str, Any]:
    """
    Civic image relevance is intentionally not evaluated in this version.
    Image safety moderation is already handled by the Safety Oracle.
    """

    if not media:
        return {
            "image_relevance": "NO_IMAGE_PROVIDED",
            "confidence": 1.0,
            "details": [],
        }

    return {
        "image_relevance": "NOT_EVALUATED_TEXT_PRIMARY",
        "confidence": 0.70,
        "details": [
            {
                "file_name": item.get("file_name", "unknown"),
                "mode": "image_relevance_disabled",
                "note": (
                    "Civic image relevance is not evaluated in this version. "
                    "Image safety is handled by the Safety Oracle."
                ),
            }
            for item in media
        ],
    }


# ---------------------------------------------------------------------
# Keyword Fallback / Supporting Explanation
# ---------------------------------------------------------------------

def find_civic_keyword_matches(text: str) -> Dict[str, Any]:
    lower = text.lower()
    category_matches: Dict[str, List[str]] = {}

    for category, keywords in CIVIC_KEYWORDS.items():
        matches = [
            keyword
            for keyword in keywords
            if keyword.lower() in lower
        ]

        if matches:
            category_matches[category] = matches

    all_matches: List[str] = []

    for matches in category_matches.values():
        all_matches.extend(matches)

    return {
        "category_matches": category_matches,
        "all_matches": sorted(list(set(all_matches))),
    }


def analyze_keyword_fallback(
    text: str,
    selected_category: str,
) -> Dict[str, Any]:
    matches = find_civic_keyword_matches(text)

    category_matches = matches["category_matches"]
    all_matches = matches["all_matches"]
    selected_category_matches = category_matches.get(selected_category, [])

    if not all_matches:
        return {
            "civic_relevant": False,
            "confidence": 0.90,
            "explanation_code": "LOW_CIVIC_RELEVANCE_KEYWORD_FALLBACK",
            "details": {
                "mode": "keyword_fallback",
                "selected_category": selected_category,
                "category_matches": category_matches,
                "all_matches": all_matches,
            },
        }

    if selected_category_matches:
        return {
            "civic_relevant": True,
            "confidence": 0.82,
            "explanation_code": "CATEGORY_AND_CIVIC_KEYWORD_MATCH",
            "details": {
                "mode": "keyword_fallback",
                "selected_category": selected_category,
                "category_matches": category_matches,
                "all_matches": all_matches,
            },
        }

    return {
        "civic_relevant": True,
        "confidence": 0.68,
        "explanation_code": "CIVIC_KEYWORD_RELEVANCE_CATEGORY_MISMATCH",
        "details": {
            "mode": "keyword_fallback",
            "selected_category": selected_category,
            "category_matches": category_matches,
            "all_matches": all_matches,
        },
    }


# ---------------------------------------------------------------------
# Semantic Civic Text Relevance
# ---------------------------------------------------------------------

def cosine_similarity_scores(text_embedding) -> List[float]:
    """
    Because all embeddings are normalized, cosine similarity is the dot product.
    """
    scores = reference_embeddings @ text_embedding
    return [float(score) for score in scores]


def get_best_reference_matches(
    scores: List[float],
    selected_category: str,
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    overall_best_index = max(range(len(scores)), key=lambda index: scores[index])

    overall_best = {
        "category": flat_reference_entries[overall_best_index]["category"],
        "reference_text": flat_reference_entries[overall_best_index]["reference_text"],
        "similarity": round(scores[overall_best_index], 4),
    }

    selected_category_candidates = [
        (index, entry)
        for index, entry in enumerate(flat_reference_entries)
        if entry["category"] == selected_category
    ]

    if not selected_category_candidates:
        return overall_best, None

    selected_best_index, selected_best_entry = max(
        selected_category_candidates,
        key=lambda pair: scores[pair[0]],
    )

    selected_category_best = {
        "category": selected_best_entry["category"],
        "reference_text": selected_best_entry["reference_text"],
        "similarity": round(scores[selected_best_index], 4),
    }

    return overall_best, selected_category_best


def analyze_semantic_text_relevance(
    text: str,
    selected_category: str,
) -> Dict[str, Any]:
    if semantic_model is None or reference_embeddings is None:
        return analyze_keyword_fallback(text, selected_category)

    cleaned_text = text.strip()

    if not cleaned_text:
        return {
            "civic_relevant": False,
            "confidence": 0.99,
            "explanation_code": "EMPTY_REPORT_TEXT",
            "details": {
                "mode": "semantic_similarity",
                "selected_category": selected_category,
                "overall_best_match": None,
                "selected_category_best_match": None,
                "keyword_support": find_civic_keyword_matches(text),
            },
        }

    text_embedding = semantic_model.encode(
        cleaned_text,
        normalize_embeddings=True,
    )

    scores = cosine_similarity_scores(text_embedding)

    overall_best_match, selected_category_best_match = get_best_reference_matches(
        scores=scores,
        selected_category=selected_category,
    )

    overall_similarity = overall_best_match["similarity"]

    selected_category_similarity = (
        selected_category_best_match["similarity"]
        if selected_category_best_match is not None
        else None
    )

    keyword_support = find_civic_keyword_matches(text)

    # Rule 1: Reject if the text is not semantically similar enough
    # to any civic/local-governance reference.
    if overall_similarity < TEXT_RELEVANCE_THRESHOLD:
        return {
            "civic_relevant": False,
            "confidence": round(1.0 - overall_similarity, 4),
            "explanation_code": "LOW_SEMANTIC_CIVIC_RELEVANCE",
            "details": {
                "mode": "semantic_similarity",
                "selected_category": selected_category,
                "overall_best_match": overall_best_match,
                "selected_category_best_match": selected_category_best_match,
                "text_relevance_threshold": TEXT_RELEVANCE_THRESHOLD,
                "category_match_threshold": CATEGORY_MATCH_THRESHOLD,
                "keyword_support": keyword_support,
            },
        }

    # Rule 2: If the selected category is known and semantically matches,
    # accept with higher confidence.
    if (
        selected_category_similarity is not None
        and selected_category_similarity >= CATEGORY_MATCH_THRESHOLD
    ):
        return {
            "civic_relevant": True,
            "confidence": round(overall_similarity, 4),
            "explanation_code": "SEMANTIC_CIVIC_RELEVANCE_AND_CATEGORY_MATCH",
            "details": {
                "mode": "semantic_similarity",
                "selected_category": selected_category,
                "overall_best_match": overall_best_match,
                "selected_category_best_match": selected_category_best_match,
                "text_relevance_threshold": TEXT_RELEVANCE_THRESHOLD,
                "category_match_threshold": CATEGORY_MATCH_THRESHOLD,
                "keyword_support": keyword_support,
            },
        }

    # Rule 3: If the selected category is unknown, e.g., "General Civic Issue",
    # or it does not match strongly, still accept if civic relevance is strong.
    # The category mismatch is reported but does not reject the civic report.
    return {
        "civic_relevant": True,
        "confidence": round(overall_similarity, 4),
        "explanation_code": "SEMANTIC_CIVIC_RELEVANCE_CATEGORY_MISMATCH_OR_GENERIC_CATEGORY",
        "details": {
            "mode": "semantic_similarity",
            "selected_category": selected_category,
            "overall_best_match": overall_best_match,
            "selected_category_best_match": selected_category_best_match,
            "text_relevance_threshold": TEXT_RELEVANCE_THRESHOLD,
            "category_match_threshold": CATEGORY_MATCH_THRESHOLD,
            "keyword_support": keyword_support,
        },
    }


# ---------------------------------------------------------------------
# Main Analyze Endpoint
# ---------------------------------------------------------------------

@app.post("/analyze")
def analyze(payload: Dict[str, Any]):
    metadata = payload.get("metadata", {})
    media = payload.get("media", [])

    text = metadata.get("text", "")
    category = metadata.get("category", "General Civic Issue")

    text_result = analyze_semantic_text_relevance(
        text=text,
        selected_category=category,
    )

    image_result = analyze_image_relevance(
        media=media,
        selected_category=category,
    )

    vote = "ACCEPT" if text_result["civic_relevant"] else "REJECT"

    logger.info(
        "Decision=%s confidence=%s reason=%s details=%s",
        vote,
        text_result["confidence"],
        text_result["explanation_code"],
        {
            "text_relevance": text_result,
            "image_relevance": image_result,
        },
    )

    return {
        "oracle_id": "ORACLE_3_CIVIC_RELEVANCE",
        "vote": vote,
        "confidence": text_result["confidence"],
        "explanation_code": text_result["explanation_code"],
        "model_name": (
            f"{SEMANTIC_MODEL_NAME} + keyword-support"
            if semantic_model is not None
            else "civic-keyword-fallback-v2"
        ),
        "model_version": "2.0.0",
        "critical_violation": False,
        "details": {
            "text_relevance": text_result,
            "image_relevance": image_result,
        },
    }
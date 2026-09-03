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
        "A local government issue involving road repair, sinkholes, damaged pavement, or transport infrastructure.",
        "A complaint regarding destroyed asphalt, unpaved road hazards, or curb damage.",
    ],
    "Waste Management": [
        "A civic report about uncollected garbage, waste dumping, overflowing bins, or rubbish on public streets.",
        "A public sanitation complaint related to trash accumulation, waste disposal, or garbage collection failure.",
        "A local government issue involving garbage removal, illegal dumping, or dumpster maintenance.",
        "A complaint about rotting waste, littered public spaces, or delayed municipal sanitation pickup.",
    ],
    "Streetlight Issue": [
        "A civic report about broken streetlights, dark public roads, damaged lamp posts, or lighting failures.",
        "A public infrastructure complaint involving non-functioning road lights or unsafe darkness at night.",
        "A local government issue related to public street lighting, burnt-out bulbs, or flickering lampposts.",
        "A safety report regarding dark pedestrian walkways and inactive street illumination.",
    ],
    "Drainage / Sewage": [
        "A civic report about blocked drains, overflowing drainage, sewage leaks, or wastewater problems.",
        "A public health complaint involving drainage failure, dirty wastewater, or blocked canals.",
        "A local government issue related to sewage, stormwater drainage, clogged culverts, or manhole backups.",
        "A complaint about foul sewer smells, overflowing gutters, or stagnant drain water.",
    ],
    "Water Supply": [
        "A civic report about leaking water pipes, broken public taps, water supply interruption, or water distribution problems.",
        "A complaint about a public water leak, pipe burst, or unavailable water service.",
        "A local governance issue related to water infrastructure, watermain breaks, or low water pressure.",
        "A report regarding contaminated municipal water or damaged public hydrants.",
    ],
    "Flooding": [
        "A civic report about flooded roads, waterlogged streets, rainwater accumulation, or urban flooding.",
        "A public complaint involving floodwater blocking transportation or damaging the area.",
        "A local government issue caused by heavy rain, standing water, or stormwater inundation in public places.",
        "A report about submerged roads, storm flooding, or deep standing rainwater.",
    ],
    "Public Property Damage": [
        "A civic report about damaged public benches, broken signboards, vandalized parks, or damaged public buildings.",
        "A complaint about destruction or poor maintenance of community-owned property.",
        "A local government issue involving damaged public facilities, vandalized bus shelters, or broken playground equipment.",
        "A report regarding destroyed municipal monuments, damaged public fences, or park bench maintenance.",
        "A civic report about damaged university campus facilities, broken gym equipment, corroded sports apparatus, or unsafe fitness centers.",
        "A complaint regarding broken, defective, rusted, or hazardous equipment and machines in public gyms, sports complexes, or recreational facilities.",
        "A public infrastructure report about damaged university buildings, campus classrooms, dormitories, student housing, or educational facilities.",
        "A civic report about damaged public buildings, structural hazards, cracked walls, broken doors, broken windows, damaged elevators, or leaking roofs.",
        "A local governance complaint about municipal housing, public residential buildings, dilapidated houses, or unsafe community infrastructure.",
        "A safety hazard report concerning corroded metal fixtures, dangerous broken equipment, or neglected public institutional facilities.",
    ],
    "Traffic / Road Safety": [
        "A civic report about dangerous traffic conditions, broken signals, unsafe crossings, or accident-prone public roads.",
        "A public safety complaint involving road signs, pedestrian crossings, signals, or traffic risk.",
        "A local government issue related to traffic control, malfunctioning traffic lights, damaged speed bumps, or road safety.",
        "A complaint regarding missing street signs, dangerous intersections, or pedestrian safety risks.",
    ],
    "Environmental Issue": [
        "A civic report about pollution, smoke, chemical discharge, noise pollution, dirty rivers, or environmental harm.",
        "A complaint about public environmental damage, air quality degradation, or toxic emissions affecting the community.",
        "A local governance issue related to pollution, illegal tree cutting, or environmental protection.",
        "A report regarding contaminated water bodies, excessive industrial noise, or hazardous smoke emissions.",
    ],
    "General Civic Issue": [
        "A report about a public issue that should be addressed by local authorities.",
        "A civic complaint involving community infrastructure, public safety, sanitation, or public services.",
        "A local governance report submitted by a citizen for government attention.",
        "An official civic poll, community voting inquiry, town hall proposal, or citizen survey on local policy.",
        "A public transit complaint regarding municipal bus services, train stations, or public transportation facilities.",
        "A public health complaint regarding pest infestations, stray animals, or unsanitary municipal facilities.",
        "A civic complaint regarding university campus infrastructure, student facility hazards, academic property damage, or school safety.",
        "A report about community sports centers, municipal gym facilities, dangerous recreation equipment, or public building hazards.",
        "A civic report about broken infrastructure, structural damage, safety hazards, or maintenance defects in public institutions, universities, and civic buildings.",
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
        "asphalt",
        "pavement",
        "sinkhole",
        "curb",
        "kerb",
        "tar",
        "surface",
    ],
    "Waste Management": [
        "garbage",
        "waste",
        "trash",
        "dump",
        "bin",
        "rubbish",
        "litter",
        "sanitation",
        "dumping",
        "dumpster",
        "littering",
        "refuse",
        "debris",
    ],
    "Streetlight Issue": [
        "streetlight",
        "lamp",
        "light",
        "dark",
        "pole",
        "street light",
        "lighting",
        "bulb",
        "illumination",
        "lamppost",
    ],
    "Drainage / Sewage": [
        "drain",
        "drainage",
        "sewage",
        "canal",
        "blocked",
        "overflow",
        "wastewater",
        "manhole",
        "sewer",
        "culvert",
        "gutter",
        "clogged",
    ],
    "Water Supply": [
        "water",
        "pipe",
        "leak",
        "supply",
        "tap",
        "burst pipe",
        "waterworks",
        "hydrant",
        "pipeline",
        "watermain",
        "leakage",
    ],
    "Flooding": [
        "flood",
        "waterlogged",
        "rain",
        "overflow",
        "standing water",
        "inundation",
        "submerged",
        "stormwater",
        "deluge",
    ],
    "Public Property Damage": [
        "broken",
        "damaged",
        "park",
        "bench",
        "sign",
        "public",
        "vandalized",
        "vandalism",
        "facility",
        "facilities",
        "shelter",
        "playground",
        "monument",
        "structure",
        "building",
        "buildings",
        "gym",
        "gymnasium",
        "equipment",
        "equipments",
        "machine",
        "machinery",
        "apparatus",
        "corroded",
        "corrosion",
        "rust",
        "rusty",
        "university",
        "campus",
        "college",
        "school",
        "hall",
        "housing",
        "house",
        "houses",
        "dormitory",
        "hostel",
        "complex",
        "wall",
        "roof",
        "ceiling",
        "elevator",
        "lift",
        "door",
        "window",
        "stairs",
        "staircase",
        "railing",
        "fence",
        "gate",
        "hazard",
        "hazardous",
        "unsafe",
        "dangerous",
        "defect",
        "defective",
        "fitness",
        "sports",
        "recreation",
    ],
    "Traffic / Road Safety": [
        "traffic",
        "accident",
        "crossing",
        "signal",
        "vehicle",
        "unsafe road",
        "speed bump",
        "pedestrian",
        "intersection",
        "crosswalk",
        "speeding",
        "signage",
    ],
    "Environmental Issue": [
        "pollution",
        "smoke",
        "tree",
        "river",
        "chemical",
        "noise",
        "emissions",
        "air quality",
        "contamination",
        "exhaust",
        "toxic",
        "deforestation",
    ],
    "General Civic Issue": [
        "public",
        "community",
        "government",
        "municipal",
        "issue",
        "problem",
        "authority",
        "infrastructure",
        "city",
        "citizen",
        "poll",
        "vote",
        "survey",
        "governance",
        "council",
        "town hall",
        "bylaw",
        "proposal",
        "transit",
        "bus",
        "health",
        "safety",
        "university",
        "campus",
        "college",
        "school",
        "institution",
        "institutional",
        "student",
        "gym",
        "facility",
        "facilities",
        "building",
        "housing",
        "residence",
        "dormitory",
        "damage",
        "corrosion",
        "corroded",
        "hazard",
        "maintenance",
        "repair",
        "recreation",
    ],
}

NON_CIVIC_PHRASES = [
    "personal blog entry",
    "favorite movie",
    "sports on tv",
    "weather is nice today",
    "crypto",
    "bitcoin",
    "ethereum",
    "dogecoin",
    "financial speculation",
    "stock market",
    "investment right now",
    "movie is great",
    "personal blog",
    "tv series",
    "video game",
    "recipe",
    "vacation review",
    "fashion trend",
    "celebrity gossip",
    "music album",
    "trading strategy",
    "buy product",
    "best price",
]


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
    lower = text.lower()
    non_civic_matches = [phrase for phrase in NON_CIVIC_PHRASES if phrase in lower]

    matches = find_civic_keyword_matches(text)
    category_matches = matches["category_matches"]
    all_matches = matches["all_matches"]
    selected_category_matches = category_matches.get(selected_category, [])

    if non_civic_matches and not selected_category_matches:
        return {
            "civic_relevant": False,
            "confidence": 0.92,
            "explanation_code": "NON_CIVIC_CONTENT",
            "details": {
                "mode": "keyword_fallback",
                "selected_category": selected_category,
                "non_civic_matches": non_civic_matches,
                "category_matches": category_matches,
                "all_matches": all_matches,
            },
        }

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
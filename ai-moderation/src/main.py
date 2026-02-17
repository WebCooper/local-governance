"""
AI Oracle Content Moderation API

A FastAPI-based service that provides AI-powered content moderation for civic reporting
platforms. This API validates text and media content, anonymizes personal information,
and provides blockchain-verifiable signatures for approved content.

Author: AI Oracle Content Moderation System
Version: 1.0.0
"""

import base64
import logging
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from src.models import check_image, check_text, check_video
from src.oracle import sign_data, validate_oracle_setup

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="AI Oracle Content Moderation API",
    description="AI-powered content moderation with blockchain oracle integration",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Add CORS middleware for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Validate oracle setup on startup
@app.on_event("startup")
async def startup_event():
    """Validate system configuration on startup."""
    logger.info("Starting AI Oracle Content Moderation API...")

    # Validate oracle configuration
    if not validate_oracle_setup():
        logger.error("CRITICAL: Oracle is not properly configured!")
        logger.error("Please check your .env file and ORACLE_PRIVATE_KEY setting.")
        # Note: In production, you might want to raise an exception here
        # to prevent the app from starting with invalid configuration
    else:
        logger.info("Oracle configuration validated successfully")

    logger.info("AI Oracle Content Moderation API started successfully")


# Response Models
class ModerationResponse(BaseModel):
    """
    Response model for content moderation requests.

    Attributes:
        decision: Either "APPROVE" or "REJECT" based on content analysis
        reason: Human-readable explanation of the moderation decision
        score: Confidence score between 0.0 and 1.0 for the decision
        signature: Cryptographic signature (only present for approved content)
        oracle_address: Ethereum address of the oracle (only present for approved content)
        safe_image_base64: Base64-encoded processed image with anonymization applied
    """

    decision: str
    reason: str
    score: float
    signature: Optional[str] = None
    oracle_address: Optional[str] = None
    safe_image_base64: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "decision": "APPROVE",
                "reason": "Content is safe and relevant for civic reporting",
                "score": 0.95,
                "signature": "478d7ca9175e4a178f943b53a27076b6...",
                "oracle_address": "0x1C93d0A8ab65f251E11786783cde3370Ff1CBc47",
                "safe_image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAY...",
            }
        }


class HealthResponse(BaseModel):
    """Health check response model."""

    status: str
    service: str
    oracle_configured: bool = False

    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "service": "AI Oracle Content Moderation",
                "oracle_configured": True,
            }
        }


# Endpoints
@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    """
    Health check endpoint to verify service status.

    Returns:
        HealthResponse: Service status information including oracle configuration state

    Example:
        GET /health

        Response:
        {
            "status": "healthy",
            "service": "AI Oracle Content Moderation",
            "oracle_configured": true
        }
    """
    oracle_status = validate_oracle_setup()

    return HealthResponse(
        status="healthy",
        service="AI Oracle Content Moderation",
        oracle_configured=oracle_status,
    )


@app.post("/moderate", response_model=ModerationResponse, tags=["Moderation"])
async def moderate_report(
    text: str = Form(
        ...,
        description="Text content to moderate (e.g., civic report description)",
        example="There's a large pothole on Main Street that needs repair",
    ),
    file: Optional[UploadFile] = File(
        None,
        description="Optional image or video file for moderation (.jpg, .png, .mp4, .mov, .avi)",
    ),
):
    """
    Moderate content submission for civic reporting.

    This endpoint analyzes submitted text and optional media files to determine
    if they are appropriate for a civic reporting platform. Approved content
    receives a blockchain-verifiable signature.

    **Content Analysis Includes:**
    - Text toxicity and spam detection
    - PII (personally identifiable information) detection
    - Image NSFW and relevance validation
    - Automatic face and license plate anonymization
    - Video keyframe analysis for safety

    **Processing Steps:**
    1. Text validation (toxicity, spam, PII)
    2. Media validation (if provided)
    3. Content anonymization (faces, plates, metadata)
    4. Cryptographic signing (if approved)

    Args:
        text: Text description of the civic issue (required)
        file: Optional image or video evidence file

    Returns:
        ModerationResponse: Moderation decision with signature if approved

    Raises:
        HTTPException: If there are validation errors or system issues

    Example:
        POST /moderate
        Content-Type: multipart/form-data

        text: "Pothole on Main Street needs repair"
        file: pothole_image.jpg

        Response:
        {
            "decision": "APPROVE",
            "reason": "Valid Evidence: a photo of a pothole",
            "score": 0.95,
            "signature": "478d7ca9...",
            "oracle_address": "0x1C93d0A8...",
            "safe_image_base64": "iVBORw0KGgo..."
        }
    """
    try:
        # 1. Text Content Analysis
        logger.info(f"Analyzing text content: {text[:50]}...")
        text_result = check_text(text)

        if text_result["decision"] == "REJECT":
            logger.info(f"Text rejected: {text_result['reason']}")
            return ModerationResponse(**text_result)

        processed_data_b64 = None
        is_video = False

        # 2. Media File Analysis (Image or Video)
        if file:
            logger.info(f"Processing uploaded file: {file.filename}")

            # Validate file size (10MB limit)
            content = await file.read()
            if len(content) > 10 * 1024 * 1024:  # 10MB
                raise HTTPException(
                    status_code=413, detail="File size exceeds 10MB limit"
                )

            filename = file.filename.lower() if file.filename else ""

            # Route based on file extension
            if filename.endswith((".mp4", ".mov", ".avi")):
                # Video Processing
                logger.info("Processing video content")
                video_result = check_video(content)

                if video_result["decision"] == "REJECT":
                    logger.info(f"Video rejected: {video_result['reason']}")
                    return ModerationResponse(**video_result)

                is_video = True
                logger.info("Video approved - original should be uploaded to IPFS")

            else:
                # Image Processing
                logger.info("Processing image content")
                image_result = check_image(content)

                if image_result["decision"] == "REJECT":
                    logger.info(f"Image rejected: {image_result['reason']}")
                    return ModerationResponse(**image_result)

                # Extract processed image data
                processed_data_b64 = image_result["safe_image_base64"]
                logger.info("Image approved and anonymized")

        # 3. Generate Oracle Signature for Approved Content
        logger.info("Generating oracle signature for approved content")
        oracle_data = sign_data(text)

        if oracle_data is None:
            raise HTTPException(
                status_code=500,
                detail="Oracle signing failed - service configuration error",
            )

        # 4. Return Success Response
        response = ModerationResponse(
            decision="APPROVE",
            reason="Content is safe and approved for civic reporting",
            score=text_result["score"],
            signature=oracle_data["signature"],
            oracle_address=oracle_data["address"],
            safe_image_base64=processed_data_b64,
        )

        logger.info(
            f"Content approved with signature: {oracle_data['signature'][:20]}..."
        )
        return response

    except HTTPException:
        # Re-raise HTTP exceptions without modification
        raise

    except Exception as e:
        logger.error(f"Unexpected error during moderation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during content moderation: {str(e)}",
        )

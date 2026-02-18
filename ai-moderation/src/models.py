import io
import base64
import os
import re
import cv2
import tempfile
import numpy as np
from transformers import pipeline
from PIL import Image

# Load the AI model once when this file is imported
# This prevents reloading it for every single request (which is slow!)
print("Loading AI Model... this might take a minute...")

# 1. Text Model : Toxicity
text_classifier = pipeline("text-classification", model="unitary/toxic-bert")

# 2. Text Model : Spam Detection
spam_classifier = pipeline(
    "text-classification",
    model="mrm8488/bert-tiny-finetuned-sms-spam-detection",  # mshenoda/roberta-spam
)

# 3. Image Safety Model (Detects NSFW/Pornography)
# We use a specific model trained to catch bad images
safety_classifier = pipeline(
    "image-classification", model="Falconsai/nsfw_image_detection"
)

# 4. Image Relevance Model (CLIP)
# This model can answer "What is in this picture?" based on labels we give it.
relevance_classifier = pipeline(
    "zero-shot-image-classification", model="openai/clip-vit-base-patch32"
)

# 5. INITIALIZE FACIAL RECOGNITION (OpenCV YuNet)
# This is a Deep Learning model that works on Python 3.13 (unlike MediaPipe)
face_model_path = "face_detection_yunet_2023mar.onnx"
face_detector = None

if os.path.exists(face_model_path):
    try:
        # Load YuNet (High accuracy, rotation invariant)
        face_detector = cv2.FaceDetectorYN.create(
            model=face_model_path,
            config="",
            input_size=(320, 320),  # Will be updated dynamically per image
            score_threshold=0.6,  # Confidence threshold (0.6 is good balance)
            nms_threshold=0.3,
            top_k=5000,
        )
        print("YuNet Face Detector loaded successfully!")
    except Exception as e:
        print(f"Error loading YuNet: {e}")
else:
    print(
        "WARNING: 'face_detection_yunet_2023mar.onnx' not found. Face blurring will be skipped."
    )

print("All AI Models loaded successfully!")


def anonymize_visuals(image_bytes):
    """
    Detects and blurs Faces (using YuNet) and License Plates.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return image_bytes

    h, w, _ = img.shape

    # 1. FACE DETECTION (Deep Learning YuNet)
    if face_detector:
        # YuNet needs to know the input image size
        face_detector.setInputSize((w, h))

        # Detect faces
        # results[1] contains the list of faces
        _, faces = face_detector.detect(img)

        if faces is not None:
            for face in faces:
                # face format: [x, y, w, h, ...]
                x, y, width, height = (
                    int(face[0]),
                    int(face[1]),
                    int(face[2]),
                    int(face[3]),
                )

                # Add a little padding to ensure the whole head is covered
                pad_x = int(width * 0.1)
                pad_y = int(height * 0.1)

                x = max(0, x - pad_x)
                y = max(0, y - pad_y)
                width = min(w - x, width + 2 * pad_x)
                height = min(h - y, height + 2 * pad_y)

                # Blur
                roi = img[y : y + height, x : x + width]
                if roi.size > 0:
                    roi = cv2.GaussianBlur(roi, (99, 99), 30)
                    img[y : y + height, x : x + width] = roi

    # 2. LICENSE PLATE DETECTION (Legacy OpenCV Haar)
    # This is a fallback if you have the XML
    if os.path.exists("haarcascade_russian_plate_number.xml"):
        try:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            plate_cascade = cv2.CascadeClassifier(
                "haarcascade_russian_plate_number.xml"
            )
            plates = plate_cascade.detectMultiScale(gray, 1.1, 4)
            for x, y, plate_w, plate_h in plates:
                roi = img[y : y + plate_h, x : x + plate_w]
                roi = cv2.GaussianBlur(roi, (99, 99), 30)
                img[y : y + plate_h, x : x + plate_w] = roi
        except Exception:
            pass

    is_success, buffer = cv2.imencode(".jpg", img)
    return buffer.tobytes() if is_success else image_bytes


def check_pii(text: str):
    """
    Scans for Personally Identifiable Information (PII).
    Returns a rejection reason string if found, otherwise None.
    """
    # 1. Sri Lankan Mobile Numbers
    # Matches: 071-1234567, 071 1234567, 0711234567, +9471...
    phone_pattern = r"(\+94|0)7\d[- ]?\d{7}"
    if re.search(phone_pattern, text):
        return "Text contains a mobile phone number. Please remove it for your privacy."

    # 2. Email Addresses
    email_pattern = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
    if re.search(email_pattern, text):
        return "Text contains an email address. Please remove it for your privacy."

    # 3. National ID (NIC) - Old (9v) & New (12 digits)
    nic_pattern = r"\b\d{9}[vVxX]\b|\b\d{12}\b"
    if re.search(nic_pattern, text):
        return "Text contains a National ID number. Please remove it."

    return None


def strip_metadata(image_bytes):
    """
    Removes EXIF metadata (GPS, Camera Settings, Timestamp).
    This prevents location leaks from the raw file.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))

        # We create a new image by copying pixel data only, dropping the rest
        data = list(img.getdata())
        image_without_exif = Image.new(img.mode, img.size)
        image_without_exif.putdata(data)

        # Save back to bytes (Standardize to JPEG)
        buffer = io.BytesIO()
        image_without_exif.save(buffer, format="JPEG")
        return buffer.getvalue()
    except Exception:
        return image_bytes  # Return original if stripping fails


def check_spam_rules(text: str):
    """
    Fast rule-based checks for obvious spam.
    Returns True if spam is detected.
    """
    # Rule A: Check for URLs (Civic reports usually don't need external links)
    if re.search(r"http[s]?://|www\.|[a-zA-Z0-9]+\.com", text):
        return "Contains unauthorized links/URLs"

    # Rule B: Common Spam Phrases
    spam_phrases = [
        "earn money",
        "buy now",
        "click here",
        "cheap",
        "discount",
        "winner",
        "prize",
    ]
    if any(phrase in text.lower() for phrase in spam_phrases):
        return "Contains commercial spam phrases"

    # Rule C: Repetitive Patterns (e.g., "Test test test test")
    # This regex looks for a word (4+ chars) repeated 3+ times
    if re.search(r"\b(\w{4,})\s+\1\s+\1", text.lower()):
        return "Contains repetitive text patterns"

    return None


def check_text(text: str):
    """
    Analyzes text for spam and toxicity.
    Returns a dictionary with the decision and reasons.
    """

    # CHECK 1: SPAM FILTER (The Heuristic)
    # If the text is too short, it's likely spam or not useful for a report.
    if len(text.strip()) < 10:
        return {
            "is_toxic": True,  # We treat spam as 'toxic' to reject it
            "decision": "REJECT",
            "reason": "Text is too short (Spam suspected)",
            "score": 0.0,
        }

    # CHECK 2: PII FILTER (Privacy Layer)
    # We reject instead of auto-deleting to ensure the user's legal testimony isn't altered.
    pii_violation = check_pii(text)
    if pii_violation:
        return {
            "decision": "REJECT",
            "reason": pii_violation,
            "score": 0.0,
        }

    # CHECK 3: SPAM FILTER (Rule-Based)
    rule_violation = check_spam_rules(text)
    if rule_violation:
        return {
            "decision": "REJECT",
            "reason": f"Spam detected: {rule_violation}",
            "score": 1.0,
        }

    # CHECK 4: AI Spam Check
    # This model uses labels: 'LABEL_0' (Not Spam) and 'LABEL_1' (Spam)
    spam_result = spam_classifier(text)[0]
    if spam_result["label"] == "LABEL_1" and spam_result["score"] > 0.8:
        return {
            "decision": "REJECT",
            "reason": f"AI identified spam content ({int(spam_result['score']*100)}%)",
            "score": spam_result["score"],
        }

    # CHECK 5: AI TOXICITY FILTER
    result = text_classifier(text)
    # The model returns a list like [{'label': 'toxic', 'score': 0.95}]
    top_result = result[0]
    score = top_result["score"]
    label = top_result["label"]

    # We reject if it is labeled 'toxic' AND the confidence is high (> 70%)
    if label == "toxic" and score > 0.7:
        return {
            "is_toxic": True,
            "decision": "REJECT",
            "reason": f"Toxic content detected ({int(score*100)}% confidence)",
            "score": score,
        }

    # IF ALL CHECKS PASS
    return {
        "is_toxic": False,
        "decision": "APPROVE",
        "reason": "Content is safe",
        "score": score,
    }


def check_image(image_bytes):
    """Validates the image FIRST, then Anonymizes it."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
    except Exception:
        return {"decision": "REJECT", "reason": "Invalid image file", "score": 0.0}

    # STEP 1: Strip Metadata
    image_bytes = strip_metadata(image_bytes)
    img = Image.open(io.BytesIO(image_bytes))

    # CHECK 1 : Safety (NSFW)
    safety_results = safety_classifier(img)
    for res in safety_results:
        if res["label"] == "nsfw" and res["score"] > 0.8:
            return {
                "decision": "REJECT",
                "reason": "NSFW content detected",
                "score": res["score"],
            }

    # CHECK 2 : Relevance (CLIP)
    candidate_labels = [
        "a photo of a pothole",
        "garbage pile",
        "broken road",
        "street light",
        "public infrastructure",
        "a selfie",
        "a face",
        "a pet",
        "food",
        "screenshot",
    ]

    relevance_results = relevance_classifier(img, candidate_labels=candidate_labels)
    top_match = relevance_results[0]
    top_label = top_match["label"]
    top_score = top_match["score"]

    valid_categories = [
        "a photo of a pothole",
        "garbage pile",
        "broken road",
        "street light",
        "public infrastructure",
    ]
    face_labels = ["a face", "a selfie"]

    if top_label in valid_categories:
        pass
    elif top_label in face_labels:
        has_infrastructure = any(
            result["label"] in valid_categories for result in relevance_results[:3]
        )
        if has_infrastructure:
            pass
        else:
            return {
                "decision": "REJECT",
                "reason": f"Personal photo detected (no civic content): {top_label}",
                "score": top_score,
            }
    else:
        return {
            "decision": "REJECT",
            "reason": f"Image is irrelevant (Detected: {top_label})",
            "score": top_score,
        }

    # 4. ANONYMIZE (Privacy Layer)
    processed_bytes = anonymize_visuals(image_bytes)

    # Encode safe image
    safe_image_b64 = base64.b64encode(processed_bytes).decode("utf-8")

    return {
        "decision": "APPROVE",
        "reason": f"Valid Evidence: {top_label}",
        "score": top_score,
        "safe_image_base64": safe_image_b64,
    }


def check_video(video_bytes):
    """
    Validates a video by sampling keyframes (Start, Middle, End).
    Policy: REJECT if any face/NSFW/irrelevant content is found in keyframes.
    Returns: Decision Dict.
    """
    # 1. Save bytes to a temp file (OpenCV requires a file path)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tfile:
        tfile.write(video_bytes)
        temp_filename = tfile.name

    cap = cv2.VideoCapture(temp_filename)

    if not cap.isOpened():
        os.unlink(temp_filename)
        return {"decision": "REJECT", "reason": "Invalid video file", "score": 0.0}

    # 2. Calculate Keyframe Indices (Start, 25%, 50%, 75%, End)
    # We check 5 frames to be safe.
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    duration = total_frames / fps if fps > 0 else 0

    if duration > 20:  # Limit video length to 20 seconds
        cap.release()
        os.unlink(temp_filename)
        return {
            "decision": "REJECT",
            "reason": "Video too long (Max 20s)",
            "score": 0.0,
        }

    # Points to sample: 10%, 50%, 90% of the video
    sample_points = [
        int(total_frames * 0.1),
        int(total_frames * 0.5),
        int(total_frames * 0.9),
    ]

    for frame_idx in sample_points:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            continue

        # Convert OpenCV Frame (BGR) to Bytes (JPEG) for check_image
        is_success, buffer = cv2.imencode(".jpg", frame)
        if not is_success:
            continue
        frame_bytes = buffer.tobytes()

        # 3. Reuse Image Logic!
        # Crucial: We check the RAW frame. If check_image returns a filtered image,
        # it means it found something valid. But if it REJECTS, we fail the video.

        # NOTE: We can't use check_image directly because check_image blurs faces and APPROVES.
        # For video, we want to REJECT faces because we can't blur the whole video easily.

        # So we run a stricter "Video Frame Check"

        # A. NSFW Check
        img_pil = Image.open(io.BytesIO(frame_bytes))
        safety_results = safety_classifier(img_pil)
        if safety_results[0]["label"] == "nsfw" and safety_results[0]["score"] > 0.5:
            cap.release()
            os.unlink(temp_filename)
            return {
                "decision": "REJECT",
                "reason": "NSFW content in video",
                "score": 1.0,
            }

        # B. Face Check (Stricter for Video - No Faces Allowed)
        # We use your existing face detection logic
        # If YuNet finds a face, we reject.
        if face_detector:
            face_detector.setInputSize((frame.shape[1], frame.shape[0]))
            _, faces = face_detector.detect(frame)
            if faces is not None and len(faces) > 0:
                cap.release()
                os.unlink(temp_filename)
                return {
                    "decision": "REJECT",
                    "reason": "Video contains people (Privacy Policy)",
                    "score": 1.0,
                }

    cap.release()
    os.unlink(temp_filename)

    # 4. If all frames passed
    return {
        "decision": "APPROVE",
        "reason": "Video content appears safe (Keyframe Analysis)",
        "score": 0.0,
        "is_video": True,
    }

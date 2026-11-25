
from pathlib import Path
import joblib

# Load the trained Civic360 category model.
MODEL_PATH = Path(__file__).with_name("civic360_model.pkl")
model = joblib.load(MODEL_PATH)


def predict_priority(text: str) -> str:
    """Assign priority using transparent keyword-based rules."""

    text = text.lower()

    high_keywords = [
        "accident", "dangerous", "emergency", "overflowing sewage",
        "major leak", "water contamination", "burst pipe",
        "severe flooding", "electrical hazard"
    ]

    medium_keywords = [
        "pothole", "blocked drain", "drainage blockage",
        "garbage", "waste accumulation", "water leakage",
        "damaged road", "dirty water"
    ]

    if any(word in text for word in high_keywords):
        return "High"

    if any(word in text for word in medium_keywords):
        return "Medium"

    return "Low"


def classify_complaint(text: str) -> dict:
    """Predict category using ML and priority using rules."""

    prediction = str(model.predict([text])[0])
    probabilities = model.predict_proba([text])[0]
    confidence = round(float(max(probabilities)) * 100, 2)

    priority = predict_priority(text)

    return {
        "category": prediction,
        "priority": priority,
        "confidence": confidence,
    }


from pathlib import Path
import re

try:
    import joblib
    MODEL_PATH = Path(__file__).with_name("civic360_model.pkl")
    model = joblib.load(MODEL_PATH)
except Exception:
    model = None

CATEGORIES = {
    "Water Quality": [
        "smell", "smelly", "bad smell", "foul smell", "bad taste", "taste of water",
        "dirty water", "muddy water", "contaminated water", "water contamination",
        "yellow water", "brown water", "black water", "unsafe water", "water quality",
        "drinking water", "water smells", "water stinks"
    ],
    "Water Supply / Pipe Damage": [
        "broken pipe", "pipe broken", "burst pipe", "damaged pipe", "water pipe",
        "pipeline broken", "pipeline damaged", "pipe leakage", "pipe leak", "water leak",
        "water leakage", "leaking pipe", "connection broken", "water connection",
        "broken water connection", "water supply pipe", "supply pipe", "pipe damage",
        "water is leaking", "leakage from pipe"
    ],
    "Drainage": [
        "drain", "drainage", "blocked drain", "drain blocked", "drainage blockage",
        "sewage", "sewer", "sewerage", "wastewater", "dirty drain", "overflowing drain",
        "drain overflow", "sewage overflow", "water logging", "waterlogged", "stagnant water"
    ],
    "Garbage": [
        "garbage", "trash", "rubbish", "litter", "waste collection", "waste disposal",
        "dumped waste", "garbage pile", "garbage accumulation", "dustbin", "dumping"
    ],
    "Road Damage": [
        "pothole", "potholes", "road damage", "damaged road", "broken road", "road is broken",
        "street damage", "bad road", "road condition"
    ],
}

HIGH_TERMS = [
    "burst pipe", "major leak", "water contamination", "contaminated water",
    "sewage overflow", "overflowing sewage", "severe flooding", "dangerous",
    "emergency", "accident", "unsafe water"
]
MEDIUM_TERMS = [
    "broken pipe", "pipe leak", "water leakage", "water leak", "blocked drain",
    "drainage blockage", "pothole", "garbage", "dirty water", "waterlogging",
    "stagnant water", "damaged road"
]


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().strip())


def _score_categories(text: str):
    scores = {}
    matched = {}
    for category, terms in CATEGORIES.items():
        hits = []
        score = 0
        for term in terms:
            if term in text:
                weight = 3 if " " in term else 2
                score += weight
                hits.append(term)
        if score:
            scores[category] = score
            matched[category] = hits
    return scores, matched


def predict_priority(text: str):
    t = _clean(text)
    if any(x in t for x in HIGH_TERMS):
        return "High"
    if any(x in t for x in MEDIUM_TERMS):
        return "Medium"
    return "Low"


def classify(text: str):
    t = _clean(text)
    scores, matched = _score_categories(t)

    # Transparent civic rules take precedence over the small demo ML model.
    if scores:
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        primary = ranked[0][0]
        all_categories = [name for name, score in ranked if score >= 2]
        related = all_categories[1:]
        total = sum(scores.values())
        confidence = min(98.0, round(65 + (scores[primary] / max(total, 1)) * 30, 2))
        reason_parts = []
        for name in all_categories:
            reason_parts.append(f"{name}: {', '.join(matched[name][:3])}")
        reason = "Detected multiple civic issues: " + "; ".join(reason_parts) + "."
        return {
            "category": " + ".join(all_categories),
            "categories": all_categories,
            "primary_category": primary,
            "related_categories": related,
            "priority": predict_priority(t),
            "confidence": confidence,
            "reason": reason,
        }

    # Use the model only when the rule layer cannot identify a civic category.
    if model:
        try:
            prediction = str(model.predict([text])[0])
            confidence = round(float(max(model.predict_proba([text])[0])) * 100, 2)
            return {
                "category": prediction,
                "categories": [prediction],
                "primary_category": prediction,
                "related_categories": [],
                "priority": predict_priority(t),
                "confidence": confidence,
                "reason": "AI model used because no strong civic phrase match was found.",
            }
        except Exception:
            pass

    return {
        "category": "Municipal Administration",
        "categories": ["Municipal Administration"],
        "primary_category": "Municipal Administration",
        "related_categories": [],
        "priority": predict_priority(t),
        "confidence": 55.0,
        "reason": "The statement needs authority review because the civic category is unclear.",
    }

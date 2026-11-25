
from pathlib import Path

import joblib
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score


BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "training_data.csv"
MODEL_PATH = BASE_DIR / "civic360_model_candidate.pkl"

# Load training data
data = pd.read_csv(DATA_PATH)

# Validate dataset
required_columns = {"description", "category"}

if not required_columns.issubset(data.columns):
    raise ValueError("CSV must contain description and category columns.")

data = data.dropna(subset=["description", "category"])
data["description"] = data["description"].astype(str).str.strip()
data["category"] = data["category"].astype(str).str.strip()
data = data[(data["description"] != "") & (data["category"] != "")]

print("Total examples:", len(data))
print("\nCategory distribution:")
print(data["category"].value_counts())

# Split data into training and testing sets
X_train, X_test, y_train, y_test = train_test_split(
    data["description"],
    data["category"],
    test_size=0.2,
    random_state=42,
    stratify=data["category"]
)

# Character n-grams help recognize patterns across Indian language scripts
model = Pipeline([
    (
        "tfidf",
        TfidfVectorizer(
            analyzer="char",
            ngram_range=(2, 5),
            sublinear_tf=True
        )
    ),
    (
        "classifier",
        LogisticRegression(
            max_iter=2000,
            class_weight="balanced"
        )
    )
])

# Train
print("\nTraining Civic360 model...")
model.fit(X_train, y_train)

# Evaluate
predictions = model.predict(X_test)

print("\nAccuracy:", round(accuracy_score(y_test, predictions) * 100, 2), "%")
print("\nClassification report:")
print(classification_report(y_test, predictions, zero_division=0))

print("\nConfusion matrix:")
print(confusion_matrix(y_test, predictions, labels=model.classes_))
print("\nCategory order:", list(model.classes_))

# Save separately; do not overwrite the live model
joblib.dump(model, MODEL_PATH)

print("\nCandidate model saved at:", MODEL_PATH)

"""
Civic360 database layer.

Beginner mode: stores complaints in a local JSON file.
Later: set FIRESTORE_ENABLED=true and GOOGLE_APPLICATION_CREDENTIALS
to switch to Firebase Firestore without changing the API routes.
"""
import json
import os
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(exist_ok=True)
JSON_FILE = DATA_DIR / "complaints.json"

_firestore_client = None


def _use_firestore() -> bool:
    return os.getenv("FIRESTORE_ENABLED", "false").lower() == "true"


def _get_firestore():
    """Create a Firestore connection only when Firestore mode is enabled."""
    global _firestore_client
    if _firestore_client is None:
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
        except ImportError as exc:
            raise RuntimeError(
                "Firestore mode needs firebase-admin. Run: pip install firebase-admin"
            ) from exc

        if not firebase_admin._apps:
            credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if credentials_path:
                cred = credentials.Certificate(credentials_path)
                firebase_admin.initialize_app(cred)
            else:
                # Supports Google-hosted environments with Application Default Credentials.
                firebase_admin.initialize_app()

        _firestore_client = firestore.client()
    return _firestore_client


def _read_json() -> list[dict[str, Any]]:
    if not JSON_FILE.exists():
        JSON_FILE.write_text("[]", encoding="utf-8")
    try:
        return json.loads(JSON_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raise RuntimeError("data/complaints.json is invalid JSON. Restore it to: []")


def _write_json(items: list[dict[str, Any]]) -> None:
    JSON_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")


def create_complaint(complaint: dict[str, Any]) -> dict[str, Any]:
    if _use_firestore():
        db = _get_firestore()
        db.collection("complaints").document(complaint["complaint_id"]).set(complaint)
        return complaint

    items = _read_json()
    items.append(complaint)
    _write_json(items)
    return complaint


def get_all_complaints() -> list[dict[str, Any]]:
    if _use_firestore():
        db = _get_firestore()
        docs = db.collection("complaints").stream()
        return [doc.to_dict() for doc in docs]

    return _read_json()


def get_complaint(complaint_id: str) -> dict[str, Any] | None:
    if _use_firestore():
        db = _get_firestore()
        doc = db.collection("complaints").document(complaint_id).get()
        return doc.to_dict() if doc.exists else None

    return next(
        (item for item in _read_json() if item["complaint_id"] == complaint_id),
        None
    )


def update_complaint_status(complaint_id: str, status: str) -> dict[str, Any] | None:
    if _use_firestore():
        db = _get_firestore()
        ref = db.collection("complaints").document(complaint_id)
        doc = ref.get()
        if not doc.exists:
            return None
        ref.update({"status": status})
        updated = ref.get()
        return updated.to_dict()

    items = _read_json()
    for item in items:
        if item["complaint_id"] == complaint_id:
            item["status"] = status
            _write_json(items)
            return item
    return None

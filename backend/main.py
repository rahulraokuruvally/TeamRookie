from pathlib import Path
from fastapi import UploadFile, File
from fastapi.staticfiles import StaticFiles
from uuid import uuid4
from typing import Literal
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import database

app = FastAPI(
    title="Civic360 API",
    description="Backend API for citizen complaints and the authority dashboard.",
    version="1.0.0"
)
# Image storage
UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Make uploaded images accessible through URLs
app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_DIR)),
    name="uploads"
)

# Allows the separate citizen and admin websites to call this API during development.
# For a real deployment, replace "*" with your deployed website domains.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ComplaintStatus = Literal["Pending", "In Progress", "Resolved"]
Priority = Literal["High", "Medium", "Low"]
Category = Literal["Water Quality", "Drainage", "Garbage", "Road Damage"]


class ComplaintCreate(BaseModel):
    description: str = Field(min_length=3, max_length=2000)
    language: str = "English"
    latitude: float | None = None
    longitude: float | None = None
    manual_location: str | None = None
    image_url: str | None = None
    

class ComplaintStatusUpdate(BaseModel):
    status: ComplaintStatus


class ClassifyRequest(BaseModel):
    description: str = Field(min_length=3, max_length=2000)
class FeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    review: str = Field(min_length=1, max_length=1000)
   


def run_ai_classification(description: str) -> dict:
    """
    Calls Developer 3's ai_model.py.
    Expected function: classify_complaint(text)
    Expected keys: category, priority, confidence.
    """
    try:
        from ai_model import classify_complaint
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="AI module is not connected yet. Add ai_model.py and its trained models."
        ) from exc

    try:
        result = classify_complaint(description)
        return {
            "category": result["category"],
            "priority": result["priority"],
            "confidence": float(result["confidence"])
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI classification failed: {exc}") from exc


def assign_departments(description: str) -> list[dict]:
    """Assign relevant departments based on complaint keywords."""

    text = description.lower()
    departments = []

    def add_department(name, task):
        departments.append({
            "department": name,
            "task": task,
            "status": "Pending"
        })

    # Water pipeline issues
    if any(word in text for word in [
        "pipeline leak", "pipe leak", "water leak",
        "burst pipe", "water leakage"
    ]):
        add_department(
            "Water Supply",
            "Inspect and repair the leaking water pipeline."
        )

    # Sewage and drainage issues
    if any(word in text for word in [
        "sewage", "sewer", "drainage", "drain overflow"
    ]):
        add_department(
            "Sewerage",
            "Inspect and resolve the sewage or drainage issue."
        )

    # Road damage
    if any(word in text for word in [
        "road damage", "damaged road", "pothole",
        "broken road", "road repair"
    ]):
        add_department(
            "Road Maintenance",
            "Repair and restore the damaged road."
        )

    # Garbage issues
    if any(word in text for word in [
        "garbage", "waste", "rubbish", "litter"
    ]):
        add_department(
            "Sanitation",
            "Remove garbage and clean the affected area."
        )

    # Electrical issues
    if any(word in text for word in [
        "electricity", "power line", "exposed wire",
        "electric pole"
    ]):
        add_department(
            "Electricity",
            "Inspect and resolve the electrical issue."
        )

    # Fallback
    if not departments:
        add_department(
            "Municipal Administration",
            "Review the complaint and assign the responsible department."
        )

    return departments

@app.get("/")
def home():
    return {"message": "Civic360 API is running"}

@app.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):

    allowed_types = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp"
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG and WEBP images are allowed."
        )

    image_data = await file.read()

    if len(image_data) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Image must be smaller than 5 MB."
        )

    extension = allowed_types[file.content_type]
    filename = f"{uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / filename

    with open(file_path, "wb") as image_file:
        image_file.write(image_data)

    return {
        "message": "Image uploaded successfully",
        "image_url": f"/uploads/{filename}"
    }
    return {"message": "Welcome to Civic360 API", "docs": "/docs"}
@app.get("/complaints")
def list_complaints():
    return {"complaints": database.get_all_complaints()}


@app.get("/complaints/{complaint_id}")
def complaint_details(complaint_id: str):
    complaint = database.get_complaint(complaint_id)
    if complaint is None:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {"complaint": complaint}


@app.patch("/complaints/{complaint_id}/status")
def change_status(complaint_id: str, payload: ComplaintStatusUpdate):
    updated = database.update_complaint_status(complaint_id, payload.status)
    if updated is None:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {"message": "Status updated", "complaint": updated}


@app.get("/stats")
def get_stats():
    complaints = database.get_all_complaints()
    total = len(complaints)
    by_status = {
        status: sum(1 for item in complaints if item.get("status") == status)
        for status in ["Pending", "In Progress", "Resolved"]
    }
    by_category = {
        category: sum(1 for item in complaints if item.get("category") == category)
        for category in ["Water Quality", "Drainage", "Garbage", "Road Damage"]
    }
    return {
        "total": total,
        "pending": by_status["Pending"],
        "in_progress": by_status["In Progress"],
        "resolved": by_status["Resolved"],
        "by_status": by_status,
        "by_category": by_category
    }


@app.post("/classify")
def classify_only(payload: ClassifyRequest):
    """Lets the frontend or team test the AI without saving a complaint."""
    return run_ai_classification(payload.description)


@app.post("/complaints", status_code=201)
def submit_complaint(payload: ComplaintCreate):
    # Ask the AI module to suggest category and priority.
    ai_result = run_ai_classification(payload.description)

    # Assign responsible departments.
    department_tasks = assign_departments(payload.description)

    complaint = {
        "complaint_id": "CIV-" + uuid4().hex[:8].upper(),
        "description": payload.description,
        "language": payload.language,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "manual_location": payload.manual_location,
        "image_url": payload.image_url,
        "category": ai_result["category"],
        "priority": ai_result["priority"],
        "confidence": ai_result["confidence"],
        "status": "Pending",
        "department_tasks": department_tasks,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    database.create_complaint(complaint)

    return {
        "message": "Complaint submitted successfully",
        "complaint": complaint
    }

@app.post("/complaints/{complaint_id}/feedback")
def submit_complaint_feedback(
    complaint_id: str,
    payload: FeedbackCreate
):
    try:
        complaint = database.submit_feedback(
            complaint_id,
            payload.rating,
            payload.review
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if complaint is None:
        raise HTTPException(status_code=404, detail="Complaint not found")

    return {
        "message": "Feedback submitted successfully",
        "feedback": complaint["feedback"]
    }

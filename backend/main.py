from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from uuid import uuid4
from datetime import datetime, timezone
import database
from ai_model import classify

app=FastAPI(title="Civic360 API",version="2.0")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_credentials=False,allow_methods=["*"],allow_headers=["*"])

USERS={
 "citizen@civic360.com":{"password":"citizen123","role":"citizen","user_id":"C360-CIT-1001","name":"Demo Citizen"},
 "admin@civic360.com":{"password":"admin123","role":"authority","user_id":"C360-ADM-0001","name":"Civic Authority Admin"}
}

class Login(BaseModel):
    identifier:str
    password:str
    role:str

class Translation(BaseModel):
    text:str
    language:str

class ComplaintCreate(BaseModel):
    user_id:str
    description:str=Field(min_length=2,max_length=2000)
    language:str="English"
    latitude:float|None=None
    longitude:float|None=None
    category:str|None=None

class StatusUpdate(BaseModel):
    status:str
    authority_id:str

@app.get("/")
def home(): return {"message":"Civic360 API v2","docs":"/docs"}

@app.post("/auth/login")
def login(p:Login):
    u=USERS.get(p.identifier.lower())
    if not u or u["password"]!=p.password or u["role"]!=p.role:
        raise HTTPException(401,"Invalid credentials or selected role.")
    return {"user":{"user_id":u["user_id"],"name":u["name"],"role":u["role"]}}

# Demo translation layer. For production, replace/extend this endpoint with a verified multilingual translation model/API.
WORD_MAP={
 "gadda":"pothole","gaddha":"pothole","gaddhe":"potholes",
 "sadak":"road","sadak mein":"on the road","pani":"water","paani":"water",
 "ganda":"dirty","gandi":"dirty","gandha":"dirty","kachra":"garbage",
 "naali":"drain","nali":"drain","band":"blocked","toota":"broken",
 "rashta":"road","badbu":"bad smell","paani aa raha hai":"water is coming",
 "paani nahi aa raha":"water is not coming"
}
PHRASES=sorted(WORD_MAP.items(),key=lambda x:len(x[0]),reverse=True)

def normalize_to_english(text,language):
    if language=="English": return text, "Original English statement retained."
    result=text.lower()
    for src,dst in PHRASES:
        result=result.replace(src,dst)
    # Preserve a clear statement even when only some words are translated.
    return result.capitalize(), "Demo multilingual normalisation: common civic terms are translated into understandable English. Connect a production translation model for full-sentence translation."

@app.post("/translate")
def translate(p:Translation):
    english,note=normalize_to_english(p.text,p.language)
    return {"english_statement":english,"note":note}

@app.post("/complaints",status_code=201)
def create_complaint(p:ComplaintCreate):
    if not any(u["user_id"]==p.user_id and u["role"]=="citizen" for u in USERS.values()):
        raise HTTPException(401,"Unknown citizen ID.")
    english,_=normalize_to_english(p.description,p.language)
    ai=classify(english)
    category=p.category or ai["category"]
    item={
      "complaint_id":"CIV-"+uuid4().hex[:8].upper(),
      "user_id":p.user_id,
      "description":p.description,
      "english_statement":english,
      "language":p.language,
      "latitude":p.latitude,
      "longitude":p.longitude,
      "category":category,
      "categories":ai.get("categories", [category]),
      "primary_category":ai.get("primary_category", category),
      "related_categories":ai.get("related_categories", []),
      "ai_reason":ai.get("reason", ""),
      "priority":ai["priority"],
      "confidence":ai["confidence"],
      "status":"Pending",
      "working_status":"Awaiting authority review",
      "created_at":datetime.now(timezone.utc).isoformat(),
      "updated_at":datetime.now(timezone.utc).isoformat()
    }
    database.create(item)
    return {"message":"Complaint submitted successfully","complaint":item}

@app.get("/complaints/user/{user_id}")
def user_complaints(user_id:str):
    return {"complaints":[x for x in database.all() if x.get("user_id")==user_id]}

@app.get("/complaints/{cid}")
def complaint(cid:str):
    item=database.get(cid)
    if not item: raise HTTPException(404,"Complaint not found")
    return {"complaint":item}

@app.get("/admin/complaints")
def admin_complaints(status:str|None=None,priority:str|None=None,category:str|None=None):
    items=database.all()
    if status: items=[x for x in items if x.get("status")==status]
    if priority: items=[x for x in items if x.get("priority")==priority]
    if category: items=[x for x in items if category in x.get("categories", [x.get("category")]) or x.get("category")==category]
    return {"complaints":list(reversed(items))}

@app.patch("/admin/complaints/{cid}/status")
def admin_status(cid:str,p:StatusUpdate):
    if p.authority_id!="C360-ADM-0001": raise HTTPException(403,"Authority credentials required.")
    if p.status not in ["Pending","In Progress","Resolved"]: raise HTTPException(400,"Invalid status.")
    item=database.update_status(cid,p.status)
    if not item: raise HTTPException(404,"Complaint not found")
    return {"message":"Status updated","complaint":item}

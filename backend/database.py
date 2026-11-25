import json
from pathlib import Path
from datetime import datetime, timezone

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(exist_ok=True)
FILE = DATA_DIR / "complaints.json"

def read():
    if not FILE.exists():
        FILE.write_text("[]", encoding="utf-8")
    return json.loads(FILE.read_text(encoding="utf-8"))

def write(items):
    FILE.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")

def create(item):
    items = read()
    items.append(item)
    write(items)
    return item

def all():
    return read()

def get(cid):
    return next((x for x in read() if x["complaint_id"] == cid), None)

def update_status(cid, status):
    items = read()
    for item in items:
        if item["complaint_id"] == cid:
            item["status"] = status
            item["working_status"] = {
                "Pending": "Awaiting authority review",
                "In Progress": "Field team working on the issue",
                "Resolved": "Work completed — awaiting/recorded verification"
            }[status]
            item["updated_at"] = datetime.now(timezone.utc).isoformat()
            write(items)
            return item
    return None

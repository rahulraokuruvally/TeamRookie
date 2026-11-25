# Civic360 Upgraded – User + Authority Interface

## AI classification update
The AI layer now checks transparent civic phrases before the demo ML model. This prevents a complaint from being classified as Garbage merely because it contains words such as "water" or "smell".

Examples:
- `water smells bad` -> **Water Quality**
- `broken water pipe` -> **Water Supply / Pipe Damage**
- `water pipe is leaking near the drain` -> **Water Supply / Pipe Damage** + related **Drainage**
- `blocked drain` -> **Drainage**
- `garbage is dumped` -> **Garbage**
- `large pothole on the road` -> **Road Damage**

The complaint record also stores related categories and an AI reason so the authority can understand why the category was selected.

## Backend
```powershell
cd backend
py -m venv .venv
.\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt
.\\.venv\\Scripts\\python.exe -m uvicorn main:app --reload
```

## Frontend
Open `frontend/index.html` with VS Code Live Server while the backend remains running.

Demo citizen: `citizen@civic360.com` / `citizen123`

Demo authority: `admin@civic360.com` / `admin123`

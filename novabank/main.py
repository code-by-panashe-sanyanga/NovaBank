"""FastAPI entrypoint: HTML UI + /api + WebSockets + OpenAPI docs at /docs."""

from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request

from novabank.api import router as api_router
from novabank.config import SECRET_KEY
from novabank.database import init_db
from novabank.features import router as features_router
from novabank.hub import hub
from novabank.settings_api import router as settings_router

BASE = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(BASE / "templates"))

app = FastAPI(
    title="NovaBank",
    description="Double-entry ledger banking API",
    version="2.0.0",
)

app.include_router(api_router, prefix="/api")
app.include_router(features_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.mount("/static", StaticFiles(directory=str(BASE / "static")), name="static")


@app.on_event("startup")
def on_startup():
    if SECRET_KEY == "novabank-dev":
        print("WARNING: SECRET_KEY is still the default.")
    init_db()


def _page(name: str):
    def view(request: Request):
        return templates.TemplateResponse(request, name)

    return view


app.get("/")(_page("index.html"))
app.get("/login")(_page("login.html"))
app.get("/register")(_page("register.html"))
app.get("/dashboard")(_page("dashboard.html"))
app.get("/accounts")(_page("accounts.html"))
app.get("/payments")(_page("payments.html"))
app.get("/cards")(_page("cards.html"))
app.get("/pots")(_page("pots.html"))
app.get("/insights")(_page("insights.html"))
app.get("/settings")(_page("settings.html"))
app.get("/admin")(_page("admin.html"))


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    Client connects with ?token=<jwt>.
    Receives {event, data} JSON — e.g. balance updates after a transfer.
    """
    import jwt

    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4401)
        return
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = int(payload["id"])
    except Exception:
        await ws.close(code=4401)
        return

    await hub.connect(user_id, ws)
    try:
        while True:
            # Keepalive / ignore client pings
            await ws.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect(user_id, ws)

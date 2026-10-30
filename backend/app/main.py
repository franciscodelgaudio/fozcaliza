from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.db import engine, get_db
from app.models import Base
from app.routers import items, quem_recebeu


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Para produção, troque por migrações (ex.: Alembic)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Fozcaliza API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(items.router)
app.include_router(quem_recebeu.router)


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("select 1"))
    return {"status": "ok"}

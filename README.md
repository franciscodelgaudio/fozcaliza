# Fozcaliza

| Pasta       | Stack                                         |
|-------------|-----------------------------------------------|
| `frontend/` | Next.js (App Router, TypeScript) + shadcn/ui + Tailwind |
| `backend/`  | Python + FastAPI + SQLAlchemy + Neon (Postgres) |

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env            # cole a connection string do Neon em DATABASE_URL
fastapi dev app/main.py         # http://localhost:8000  (docs em /docs)
```

## Frontend

```bash
cd frontend
npm install
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                     # http://localhost:3000
```

Componentes shadcn novos: `npx shadcn@latest add <componente>`.

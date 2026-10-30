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

## ETL (coleta de dados oficiais)

```bash
cd backend
python -m etl siconfi                  # incremental: só o que foi entregue/retificado
python -m etl siconfi --desde 2024     # limita os exercícios
python -m etl siconfi --forcar         # reverifica todos os relatórios
```

- **Siconfi** (RREO, RGF, DCA e extrato de entregas de Foz do Iguaçu, desde 2013):
  as linhas vão, como publicadas, para `siconfi_linha`; o status de cada
  entrega, para `entrega_demonstrativo`.
- **Incremental**: o extrato de entregas diz o que mudou; só esses relatórios
  são baixados. Se o hash do conteúdo é o mesmo da última coleta, nada é gravado.
- **Versionado**: nada é sobrescrito. Valor corrigido na fonte encerra a versão
  atual (`valido_ate`) e insere uma nova; rodar duas vezes não duplica nada.
- **Agendamento**: `.github/workflows/etl-siconfi.yml` roda todo dia às 04:30
  e reverifica tudo no dia 1 de cada mês. Requer o secret `DATABASE_URL` no
  repositório (Settings → Secrets and variables → Actions).

## Frontend

```bash
cd frontend
npm install
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                     # http://localhost:3000
```

Componentes shadcn novos: `npx shadcn@latest add <componente>`.

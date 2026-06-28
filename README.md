# DeclarAI — AI-Powered Customs Declaration Automation

> AI Open Innovation Challenge 2026 | Team Last Minute | President University

DeclarAI automates customs declaration processing at Cikarang Dry Port using OCR + LLM technology, reducing per-declaration processing time from **30–40 minutes to under 2 minutes**.

---

## 🏗️ Project Structure

```
declarai-project/
├── backend/      ← FastAPI + PostgreSQL + OCR/LLM pipeline
└── frontend/     ← React + Vite dashboard
```

---

## ⚡ Quick Start

### 1. Backend

```bash
cd backend

# Copy & fill environment variables
cp .env.example .env
# Edit .env: set DATABASE_URL and ANTHROPIC_API_KEY

# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn main:app --reload
# → API running at http://localhost:8000
# → Docs at http://localhost:8000/docs
```

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
# → Dashboard at http://localhost:3000
```

---

## 🔑 Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Claude API key (get from console.anthropic.com) |
| `CEISA_API_URL` | CEISA H2H endpoint (sandbox default) |
| `APP_ENV` | `development` uses mock OCR/CEISA responses |

> **Note:** In `development` mode, the app uses **mock data** for OCR and LLM extraction. Set a real `ANTHROPIC_API_KEY` and change `APP_ENV=production` to enable live AI processing.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/upload` | Upload CIPL document |
| `GET` | `/api/v1/declarations` | List all declarations |
| `GET` | `/api/v1/declarations/{id}` | Get declaration detail |
| `PATCH` | `/api/v1/declarations/{id}` | Update fields manually |
| `POST` | `/api/v1/declarations/{id}/submit` | Submit to CEISA |
| `GET` | `/api/v1/declarations/stats` | Dashboard statistics |
| `GET` | `/api/v1/status/{id}` | Quick status check |
| `POST` | `/api/v1/simulator/submit` | CEISA simulator |
| `GET` | `/api/v1/simulator/schema` | CEISA field schema |
| `POST` | `/api/v1/auth/register` | Register operator |
| `POST` | `/api/v1/auth/login` | Login |

---

## 🧠 AI Pipeline (5 Stages)

```
Document Upload
     ↓
[Stage 1] OpenCV Preprocessing  → deskew, enhance, denoise
     ↓
[Stage 2] PaddleOCR Inference   → detect & read all text regions
     ↓
[Stage 3] Claude LLM Extraction → map OCR text → CEISA fields + confidence scores
     ↓
[Stage 4] Rule-Based Validation → HS code format, mandatory fields, arithmetic checks
     ↓
[Stage 5] CEISA H2H Submission  → format → submit → receive registration number
```

---

## 👥 Team

| Name | Role |
|---|---|
| Dimas Lintar Ramadhan | Project Manager |
| Diva Clara Rosiana Marpaung | Frontend Engineer & UI/UX |
| Maulidah Barakbah | AI / ML Engineer |
| Naila Atikah Isnaeni | Data Analyst & QA |
| Natasya Nurfadila | Backend Engineer |

**Institution:** President University — Information Systems, Data Science Concentration

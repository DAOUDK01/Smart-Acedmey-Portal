# Smart Academy Portal

Smart Academy Portal is an AI-powered Learning Management System (LMS) built with **Next.js**, **NestJS**, **PostgreSQL**, and **Prisma**.

---

# Project Structure

```
Smart Academy Portal/
│
├── client/          # Next.js frontend (@smart-academy/web)
├── server/          # NestJS backend (@smart-academy/api)
├── package.json     # npm workspaces root
└── README.md
```

---

# Requirements

Before running the project, install:

- Node.js (v18 or later)
- npm
- PostgreSQL
- Git

Verify installation:

```bash
node -v
npm -v
```

---

# Installation

Clone the repository:

```bash
git clone <repository-url>
cd "Smart Acedmey Portal"
```

Install all dependencies from the **project root** (recommended — uses npm workspaces):

```bash
npm install
```

Or install separately:

```bash
cd server
npm install

cd ../client
npm install
```

---

# Environment Variables

## Backend

Create `server/.env`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/smartacademy"
JWT_SECRET=your_secret_key
PORT=4010
QUIZ_API_KEY=your_api_key
QUIZ_API_URL=https://api.your-provider.com/generate

# Optional — local AI fallback for quiz/transcript generation
OLLAMA_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=llama3.1
```

## Frontend

Create `client/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4010
```

---

# Database Setup

From the project root:

```bash
cd server
npx prisma generate
npx prisma db push
node prisma/seed.js
```

The seed script creates starter accounts:

| Role    | Email                      | Password    |
|---------|----------------------------|-------------|
| Admin   | admin@smartacademy.local   | Admin@123   |
| Teacher | teacher@smartacademy.local | Teacher@123 |
| Expert  | expert@smartacademy.local  | Expert@123  |
| Student | student@smartacademy.local | Student@123 |

---

# Running the Application

## Option 1 — From project root (recommended)

Open **two terminals** in the project root.

**Terminal 1 — Backend:**

```bash
npm run dev:server
```

**Terminal 2 — Frontend:**

```bash
npm run dev:client
```

## Option 2 — Run both workspaces together

```bash
npm run dev
```

## Option 3 — Run each app directly

**Backend:**

```bash
cd server
npm run start:dev
```

**Frontend:**

```bash
cd client
npm run dev
```

---

# URLs

| Service     | URL                        |
|-------------|----------------------------|
| Frontend    | http://localhost:3000      |
| Backend API | http://localhost:4010      |

---

# Common Commands

From project root:

```bash
# Install all workspace dependencies
npm install

# Development
npm run dev              # both client + server
npm run dev:client       # frontend only
npm run dev:server       # backend only

# Production build
npm run build
npm run build:client
npm run build:server
```

From `server/`:

```bash
npx prisma generate      # regenerate Prisma client
npx prisma db push       # sync schema to database
node prisma/seed.js      # seed starter data
npm run start:dev        # NestJS watch mode
npm run build            # compile backend
```

From `client/`:

```bash
npm run dev              # Next.js dev server
npm run build            # production build
npm run start            # serve production build
```

---

# Portal Workflow

1. **Registration** — New teacher, student, guardian, and expert accounts are created as **inactive** until an admin approves them.
2. **Admin approval** — Admin activates accounts from the Users tab. Until approved, portals show an empty state with no data.
3. **Quiz workflow** — AI generates quizzes as `pending` → **teacher approves** → `teacher_approved` → **expert approves** → `approved` → visible to students.
4. **Lectures** — Expert reviews and publishes lectures before they appear in the student learning flow.

---

# Troubleshooting

## Port already in use

Windows:

```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

Backend:

```bash
netstat -ano | findstr :4010
taskkill /PID <PID> /F
```

## Database connection error

- Ensure PostgreSQL is running
- Verify `DATABASE_URL` in `server/.env`
- Create the database if it does not exist
- Run `npx prisma db push` from `server/`

## Prisma errors

```bash
cd server
npx prisma generate
npx prisma db push
```

## Missing packages

```bash
npm install
```

---

# Tech Stack

**Frontend:** Next.js, TypeScript, Tailwind CSS, Recharts

**Backend:** NestJS, Prisma ORM, PostgreSQL

**Authentication:** JWT, Email OTP, Google Sign-In

**AI:** API-key or Ollama-based quiz generation

---

# Quick Start

```bash
# 1. Install dependencies (from project root)
npm install

# 2. Configure env files
#    server/.env
#    client/.env.local

# 3. Database
cd server
npx prisma generate
npx prisma db push
node prisma/seed.js

# 4. Start backend (new terminal — from project root)
npm run dev:server

# 5. Start frontend (new terminal — from project root)
npm run dev:client
```

Open http://localhost:3000 and sign in with a seeded account.

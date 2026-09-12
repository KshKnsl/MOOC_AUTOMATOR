# NPTEL Automator

Browser app for NPTEL / Swayam: solve quizzes, complete lessons, and save lecture notes to your computer.

**Live app:** [https://mooc-ash.vercel.app](https://mooc-ash.vercel.app)

## Start

```bash
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

On Vercel, set **Root Directory** to `frontend`, **Framework** to Next.js, and leave **Output Directory** empty (not `public`).

## Setup

1. Log in at [swayam.gov.in](https://swayam.gov.in).
2. Copy cookies `g_a`, `g_b`, and `g_c` from your browser.
3. In the app, open **Settings** (key icon), paste the cookies, paste a Gemini API key, then **Refresh courses**.

Your cookies, key, and files stay in this browser. Notes download to a folder you pick.

## Tabs

| Tab | What it does |
| --- | --- |
| Quiz Solver | Review, AI-solve, and submit assignments |
| Courses | Complete lessons or extract study guides |
| Study Guides | Read extracted quizzes |
| Files | Fetch PDFs to your device and preview them |

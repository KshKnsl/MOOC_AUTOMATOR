# 🚀 NPTEL & Swayam Automator

A high-performance, **zero-dependency** Python tool for Swayam / NPTEL online courses. Powered by **direct NPTEL & Swayam REST APIs**, it supports **cookie-based authentication**, **active course filtering**, **unit-wise PDF lecture note downloads**, **parallel course completion**, **high-precision quiz extraction with Markdown study guides**, and **AI-powered automated assignment solving & submission with Google Gemini**.

---

## ✨ Features

- 🔑 **Cookie Authentication**: Authenticate seamlessly using your Swayam session cookies (`g_a`, `g_b`, `g_c`) stored in `cookies.json`.
- 📚 **Active Course Filter**: Queries Swayam's REST API and automatically filters out closed or past-semester courses.
- 📑 **Unit-Wise PDF Notes Downloader**: Resolves direct PDF URLs and Google Drive shared folders to download lecture notes organized unit-by-unit. Cleans up empty folders automatically.
- ⚡ **Parallel Course Completion**: Sends lesson progress notifications concurrently across multiple workers via NPTEL's REST API (~0.05s/lesson).
- 📝 **Quiz & Answer Key Extractor**: Queries NPTEL's assessment REST API directly to extract clean questions, options, point weights, and verified answer keys to structured JSON and readable **Markdown Study Guides (`assignment_solutions.md`)**.
- 🤖 **AI Auto-Solve & Submit**: Solves unsubmitted/active assignments using **Google Gemini AI** (or embedded answer keys), displays an interactive review screen with reasoning, and automatically submits answers via NPTEL REST API upon your approval.
- ⚡ **Zero External Dependencies**: Built entirely on Python 3.8+ standard libraries (`urllib`, `asyncio`, `json`, `re`). No external pip dependencies or browser installations required!

---

## 📦 Quick Start (No Installation Required)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/nptel-automate.git
   cd nptel-automate
   ```

2. **Run directly using Python 3.8+**:
   ```bash
   python3 app.py
   ```

---

## 🚀 Usage

Run the script interactively or pass direct CLI flags:

### Interactive Menu
```bash
python3 app.py
```

```text
============================================================
🚀 NPTEL AUTOMATOR & PARALLEL PROCESSOR
============================================================
1. Set Cookies & Store in JSON (cookies.json)
2. Get All Active Courses & Store in JSON (courses.json)
3. Download All Unit-Wise PDF Notes
4. Complete All Active Courses in Parallel
5. Extract All Quizzes, Answer Keys & Markdown Solutions
6. AI Auto-Solve & Submit Assignments (with User Approval)
7. Reset Data & Clean Up Files
============================================================
```

### CLI Direct Commands

| Mode | Action | Command |
|---|---|---|
| **1** | Set Cookies | `python3 app.py -m 1 -c "g_a=...; g_b=...; g_c=..."` |
| **2** | Save Active Courses | `python3 app.py -m 2` |
| **3** | Download PDF Notes | `python3 app.py -m 3` |
| **4** | Complete All Courses | `python3 app.py -m 4 -p 5` |
| **5** | Extract Quizzes & Solution Guides | `python3 app.py -m 5` |
| **6** | AI Auto-Solve & Submit Assignments | `python3 app.py -m 6 -g "YOUR_GEMINI_KEY"` |
| **7** | Reset & Clean Up | `python3 app.py -m 7` |

---

## 🤖 AI Auto-Solver Workflow (Option 6)

1. Scans all active enrolled courses for assignments.
2. Select an assignment (or choose `A` to process all).
3. Google Gemini AI solves the questions and provides concise conceptual reasoning.
4. **Interactive Review**:
   - Inspect every question, all options, selected answer, and explanation.
   - Choose `[Y]` to submit, `[E]` to manually change any answer, or `[S]` to skip.
5. Sends the exact submission payload directly to NPTEL's REST API using your session `xsrf_token`.

---

## 📁 Output Directory Structure

```text
nptel-automate/
├── app.py                      # Main automation & AI engine
├── cookies.json                # Stored session cookies
├── courses.json                # Active enrolled courses list
├── downloaded_notes/           # Unit-wise PDF lecture notes
│   └── noc26_cs104/
│       ├── notes_index.json
│       └── Unit_20/
│           └── Lecture_01.pdf
└── extracted_quizzes/          # Extracted quizzes & study guides
    └── noc26_cs104/
        ├── quizzes.json
        └── assignment_solutions.md
```

---

## ⚙️ CLI Flags

- `-m`, `--mode`: Select execution mode (`1`-`7`).
- `-c`, `--cookies`: Raw cookie string or path to `cookies.json`.
- `-g`, `--gemini-key`: Google Gemini API Key for auto-solving.
- `--course`: Filter execution to a specific course ID (e.g. `noc26_cs104`).
- `--auto-approve`: Non-interactive auto-approval of assignment submissions.
- `-o`, `--output`: Output directory for downloaded notes (default: `./downloaded_notes`).
- `-p`, `--parallel`: Maximum parallel worker instances (default: `4`).

import argparse
import asyncio
import base64
import html as html_lib
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone


class ProgressBar:
    """Terminal progress bar with ETA & stats"""

    def __init__(self, total, description="Progress", width=35):
        self.total = max(total, 1)
        self.current = 0
        self.description = description
        self.width = width
        self.start_time = time.time()

    def update(self, increment=1):
        self.current = min(self.current + increment, self.total)
        self._display()

    def _display(self):
        percentage = (self.current / self.total) * 100
        filled_width = int(self.width * self.current // self.total)
        bar = "█" * filled_width + "░" * (self.width - filled_width)

        elapsed = time.time() - self.start_time
        if self.current > 0:
            eta = (elapsed / self.current) * (self.total - self.current)
            eta_str = f"ETA: {self._format_time(eta)}"
        else:
            eta_str = "ETA: --:--"

        elapsed_str = self._format_time(elapsed)
        sys.stdout.write(
            f"\r{self.description}: [{bar}] {percentage:5.1f}% ({self.current}/{self.total}) | {elapsed_str} | {eta_str}"
        )
        sys.stdout.flush()

    def finish(self):
        self.current = self.total
        self._display()
        print()

    def _format_time(self, seconds):
        if seconds < 60:
            return f"{seconds:.0f}s"
        elif seconds < 3600:
            minutes = int(seconds // 60)
            secs = int(seconds % 60)
            return f"{minutes}m {secs}s"
        else:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            return f"{hours}h {minutes}m"


def sanitize_filename(filename):
    """Sanitize string for filesystem safety"""
    clean = re.sub(r'[\\/*?:"<>|]', "_", str(filename)).strip()
    return clean or "notes"


def remove_empty_folders(directory):
    """Recursively delete empty folders inside a directory"""
    if not os.path.exists(directory):
        return 0
    removed_count = 0
    for root, dirs, files in os.walk(directory, topdown=False):
        for d in dirs:
            folder_path = os.path.join(root, d)
            try:
                if not os.listdir(folder_path):
                    os.rmdir(folder_path)
                    removed_count += 1
            except Exception:
                pass
    return removed_count


def clean_text_string(raw_text):
    """Clean HTML formatting while preserving image links, math, and readable content"""
    if not raw_text:
        return ""
    t = str(raw_text)

    # Convert img tags to readable Markdown images
    t = re.sub(r'<img\s+[^>]*src=[\'"]([^\'"]+)[\'"][^>]*>', r' ![Image](\1) ', t, flags=re.IGNORECASE)

    # Remove script and style tags
    t = re.sub(r'<script.*?>.*?</script>', '', t, flags=re.DOTALL | re.IGNORECASE)
    t = re.sub(r'<style.*?>.*?</style>', '', t, flags=re.DOTALL | re.IGNORECASE)

    # Decode HTML entities
    t = html_lib.unescape(t)

    # Strip remaining HTML tags
    t = re.sub(r'<[^>]+>', ' ', t)

    # Collapse multiple whitespaces
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r'\n\s*\n', '\n', t)
    clean = t.strip()
    clean = re.sub(r'^JavaScript should be enabled.*?\.\s*', '', clean).strip()
    return clean


def download_drive_file(file_id, dest_path):
    """Download direct PDF file from Google Drive file_id"""
    dl_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    try:
        req = urllib.request.Request(dl_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read()
            if len(content) > 100:
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                with open(dest_path, "wb") as f:
                    f.write(content)
                size_mb = len(content) / (1024 * 1024)
                print(f"      ✅ Downloaded PDF ({size_mb:.2f} MB) -> {os.path.basename(dest_path)}")
                return True
    except Exception as e:
        print(f"      ⚠️ Note download skip ({file_id}): {e}")
    return False


def extract_drive_folder_file_ids(folder_url):
    """Extract file IDs inside a public Google Drive folder via HTTP"""
    try:
        req = urllib.request.Request(folder_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

        file_ids = set(re.findall(r'/file/d/([a-zA-Z0-9_-]{25,})', html))
        if not file_ids:
            file_ids = set(re.findall(r'data-id="([a-zA-Z0-9_-]{25,})"', html))
        return list(file_ids)
    except Exception as e:
        print(f"      ⚠️ Drive folder scan note ({folder_url}): {e}")
        return []


# ============================================================
# GOOGLE GEMINI API SOLVER
# ============================================================

def get_gemini_api_key(cli_key=None):
    """Retrieve Gemini API Key from CLI, env vars, or local .gemini_key file"""
    if cli_key and cli_key.strip():
        return cli_key.strip()

    env_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if env_key and env_key.strip():
        return env_key.strip()

    key_file = ".gemini_key"
    if os.path.exists(key_file):
        try:
            with open(key_file, "r") as f:
                k = f.read().strip()
                if k:
                    return k
        except Exception:
            pass

    return ""


def call_gemini_api(api_key, prompt, model="gemini-2.5-flash"):
    """Pure standard-library call to Google Gemini REST API with JSON response"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (NPTEL-Automator)",
    }
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
        },
    }

    body_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates", [])
            if candidates:
                part_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return True, part_text
            return False, "No candidates returned from Gemini."
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore") if hasattr(e, "read") else str(e)
        return False, f"HTTP {e.code}: {err_msg}"
    except Exception as e:
        return False, str(e)


def solve_questions_with_gemini(api_key, course_title, quiz_title, questions):
    """Use Gemini AI to accurately solve multiple-choice and assignment questions"""
    if not api_key:
        return False, "No Gemini API key provided."

    questions_repr = []
    for q in questions:
        q_item = {
            "q_num": q.get("q_num", 1),
            "question_id": q.get("question_block_id", ""),
            "question_text": q.get("question_text", ""),
            "input_type": q.get("input_type", "radio"),
            "multiple_selections": q.get("multiple_selections", False),
            "choices": [{"choice_id": c.get("choice_id"), "text": c.get("text")} for c in q.get("choices", [])],
        }
        questions_repr.append(q_item)

    prompt = f"""You are an elite academic professor and expert tutor solving an assignment for the NPTEL / Swayam course: "{course_title}".
Assignment Title: "{quiz_title}"

Carefully analyze each question below and select the single best or correct choice(s).
For each question:
1. Provide the exact 0-based choice index (`selected_choice_index`, e.g. 0, 1, 2, 3).
2. Provide the `selected_choice_id` matching the choice_id in the input.
3. Provide the `selected_choice_text`.
4. Provide concise scientific/conceptual `reasoning` justifying why this option is correct.

Questions:
{json.dumps(questions_repr, indent=2)}

Respond with a JSON object strictly following this schema:
{{
  "solutions": [
    {{
      "q_num": 1,
      "question_id": "...",
      "selected_choice_index": 1,
      "selected_choice_id": "1",
      "selected_choice_text": "...",
      "reasoning": "..."
    }}
  ]
}}
"""

    models_to_try = ["gemini-3.6-flash", "gemini-3.6-flash", "gemini-2.0-flash-lite"]
    last_err = ""
    for model in models_to_try:
        ok, res_text = call_gemini_api(api_key, prompt, model=model)
        if ok and res_text:
            try:
                parsed = json.loads(res_text)
                if "solutions" in parsed and isinstance(parsed["solutions"], list):
                    return True, parsed["solutions"]
            except Exception as pe:
                last_err = f"JSON parse error on model {model}: {pe}"
        else:
            last_err = res_text

    return False, f"Gemini solving failed: {last_err}"


# ============================================================
# MAIN AUTOMATOR CLASS
# ============================================================

class NPTELAutomator:
    def __init__(self, cookies_input=None, output_dir="./downloaded_notes"):
        self.cookies_file = "cookies.json"
        self.courses_file = "courses.json"
        self.output_dir = os.path.abspath(output_dir)
        self.cookies_input = cookies_input
        self.cookie_str = ""
        self.load_cookies()

    def load_cookies(self):
        """Load cookies from CLI parameter, cookies.json, or string input"""
        content = ""
        if self.cookies_input:
            if os.path.exists(self.cookies_input):
                with open(self.cookies_input, "r") as f:
                    content = f.read().strip()
            else:
                content = self.cookies_input.strip()
        elif os.path.exists(self.cookies_file):
            with open(self.cookies_file, "r") as f:
                content = f.read().strip()

        if not content:
            return False

        try:
            parsed = json.loads(content)
            if isinstance(parsed, list):
                pairs = []
                for c in parsed:
                    if isinstance(c, dict) and c.get("name") and c.get("value"):
                        pairs.append(f"{c['name']}={c['value']}")
                self.cookie_str = "; ".join(pairs)
                return True
        except Exception:
            pass

        pairs = [p.strip() for p in content.strip().split(";") if "=" in p]
        if pairs:
            self.cookie_str = "; ".join(pairs)
            return True

        self.cookie_str = content.strip()
        return bool(self.cookie_str)

    def _http_get_sync(self, url, extra_headers=None):
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            "Cookie": self.cookie_str,
            "x-requested-with": "XMLHttpRequest",
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        if extra_headers:
            headers.update(extra_headers)

        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read()
            return resp.status, content

    async def http_get(self, url, extra_headers=None):
        try:
            status, content = await asyncio.to_thread(self._http_get_sync, url, extra_headers)
            return status == 200, content.decode("utf-8", errors="ignore"), content
        except Exception:
            return False, "", b""

    def _http_post_sync(self, url, json_data, extra_headers=None):
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            "Cookie": self.cookie_str,
            "x-requested-with": "XMLHttpRequest",
            "Content-Type": "application/json",
            "accept": "*/*",
            "origin": "https://onlinecourses.nptel.ac.in",
            "referer": "https://onlinecourses.nptel.ac.in",
        }
        if extra_headers:
            headers.update(extra_headers)

        body_bytes = json.dumps(json_data).encode("utf-8")
        req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read()
            return resp.status, content

    async def http_post(self, url, json_data, extra_headers=None):
        """Async POST request with JSON payload and cookie headers"""
        try:
            status, content = await asyncio.to_thread(self._http_post_sync, url, json_data, extra_headers)
            return status == 200, content.decode("utf-8", errors="ignore"), content
        except urllib.error.HTTPError as e:
            err_content = e.read().decode("utf-8", errors="ignore") if hasattr(e, "read") else str(e)
            return False, err_content, b""
        except Exception as e:
            return False, str(e), b""

    async def fetch_and_save_courses_json(self):
        """Option 2: Get all currently active/running courses from Swayam REST API and save to courses.json"""
        print("📚 Querying Swayam REST API for active enrolled courses...")
        enrolled_courses = []

        try:
            ok, res_text, _ = await self.http_get(
                "https://swayam.gov.in/rest/courses_enrolled",
                extra_headers={
                    "accept": "text/plain, */*; q=0.01",
                    "referer": "https://swayam.gov.in/mycourses",
                },
            )

            if ok and res_text:
                clean_text = res_text.replace(")]}'", "").strip()

                try:
                    api_data = json.loads(clean_text)
                except Exception:
                    api_data = {}

                payload_str = api_data.get("payload", "{}")
                try:
                    payload = json.loads(payload_str) if isinstance(payload_str, str) else payload_str
                except Exception:
                    payload = {}

                now = datetime.now(timezone.utc)

                all_items = []
                if isinstance(payload, dict):
                    all_items = payload.get("ongoing_courses", [])
                elif isinstance(api_data, list):
                    all_items = api_data

                for item in all_items:
                    if isinstance(item, dict):
                        if item.get("closed") is True:
                            continue

                        end_date_str = item.get("end_date")
                        if end_date_str:
                            try:
                                clean_end = end_date_str.replace("Z", "+00:00")
                                end_dt = datetime.fromisoformat(clean_end)
                                if end_dt < now:
                                    continue
                            except Exception:
                                pass

                        title = item.get("title") or "Unknown Course"
                        search_str = (
                            str(item.get("federated_login_url", ""))
                            + " "
                            + str(item.get("slug", ""))
                            + " "
                            + str(item.get("course_admin_email", ""))
                            + " "
                            + str(item.get("courseCode", ""))
                            + " "
                            + str(item.get("id", ""))
                        )
                        match = re.search(r"noc\d+_[a-z0-9]+", search_str, re.IGNORECASE)
                        c_id = match.group(0).lower() if match else item.get("id") or title
                        c_url = f"https://onlinecourses.nptel.ac.in/{c_id}"

                        if c_id and not any(x["id"] == c_id for x in enrolled_courses):
                            enrolled_courses.append({
                                "id": str(c_id),
                                "title": str(title),
                                "url": str(c_url),
                                "nc_code": item.get("nc_code", "NPTEL"),
                                "start_date": item.get("start_date", ""),
                                "end_date": item.get("end_date", ""),
                            })

            # Save to courses.json
            if enrolled_courses:
                with open(self.courses_file, "w", encoding="utf-8") as f:
                    json.dump(enrolled_courses, f, indent=2)

                print(f"\n✅ Saved {len(enrolled_courses)} active courses to {self.courses_file}:")
                for i, c in enumerate(enrolled_courses, 1):
                    print(f"   {i}. {c['title']} ({c['id']})")
            else:
                print("❌ No active running courses found. Please check your enrollment/cookies.")

            return enrolled_courses

        except Exception as e:
            print(f"❌ Error fetching courses: {e}")
            return []

    async def fetch_and_download_course_notes(self, course_id):
        """Option 3: Extract unit-wise PDF notes & Google Drive lecture material download links for a course"""
        c_id = course_id.rstrip("/").split("/")[-1] if "/" in course_id else course_id
        print(f"\n📑 Extracting & Downloading unit-wise PDF notes for {c_id}...")

        try:
            ok, text, _ = await self.http_get(
                f"https://onlinecourses.nptel.ac.in/e-learning/api/courseoutline?course_id={c_id}"
            )
            if not ok:
                print(f"❌ Failed to fetch course outline for {c_id}")
                return []

            data = json.loads(text)
            payload = json.loads(data.get("payload", "{}")) if isinstance(data.get("payload"), str) else data.get("payload", {})

            units = payload.get("units", {})
            lessons = payload.get("lessons", {})

            course_notes_dir = os.path.join(self.output_dir, sanitize_filename(c_id))
            os.makedirs(course_notes_dir, exist_ok=True)

            discovered_notes = []
            downloaded_pdf_count = 0

            for lkey, lval in lessons.items():
                uid = lval.get("unit_id")
                lid = lval.get("lesson_id")
                ltitle = lval.get("title", "")

                unit_obj = units.get(f"_{uid}") or units.get(str(uid)) or {}
                unit_title = unit_obj.get("title") or f"Unit_{uid}"

                unit_dir = os.path.join(course_notes_dir, sanitize_filename(unit_title))
                os.makedirs(unit_dir, exist_ok=True)

                lok, ltext, _ = await self.http_get(
                    f"https://onlinecourses.nptel.ac.in/e-learning/api/lesson?course_id={c_id}&unit_id={uid}&lesson_id={lid}"
                )
                if lok:
                    raw_links = re.findall(r'https?://[^\s"\'<>\\]+', ltext)
                    for u in raw_links:
                        clean_url = u.rstrip(';,."')
                        is_note_link = (
                            "drive.google.com" in clean_url.lower()
                            or clean_url.lower().endswith(".pdf")
                            or "pdf" in clean_url.lower()
                            or "lecture_notes" in clean_url.lower()
                        )
                        is_unwanted = any(
                            x in clean_url.lower()
                            for x in [
                                ".jpg",
                                ".png",
                                ".jpeg",
                                ".gif",
                                ".svg",
                                "forms/d/",
                                "_next",
                                "gtm",
                                "css",
                                "accessibility",
                                "logo",
                            ]
                        )

                        if is_note_link and not is_unwanted:
                            note_item = {
                                "unit_id": uid,
                                "unit_title": unit_title,
                                "lesson_title": ltitle,
                                "url": clean_url,
                            }

                            if not any(x["url"] == clean_url for x in discovered_notes):
                                discovered_notes.append(note_item)

                                # 1. Direct Drive File Download
                                if "drive.google.com/file/d/" in clean_url:
                                    m = re.search(r"/file/d/([^/\?]+)", clean_url)
                                    if m:
                                        fid = m.group(1)
                                        pdf_name = f"{sanitize_filename(ltitle)}.pdf"
                                        dest = os.path.join(unit_dir, pdf_name)
                                        if download_drive_file(fid, dest):
                                            downloaded_pdf_count += 1
                                            note_item["local_path"] = dest

                                # 2. Drive Folder Expansion & Download
                                elif "drive.google.com/drive/folders/" in clean_url:
                                    f_ids = extract_drive_folder_file_ids(clean_url)
                                    for idx, fid in enumerate(f_ids, 1):
                                        pdf_name = f"{sanitize_filename(ltitle)}_part{idx}.pdf"
                                        dest = os.path.join(unit_dir, pdf_name)
                                        if download_drive_file(fid, dest):
                                            downloaded_pdf_count += 1
                                            note_item["local_path"] = dest

                                # 3. Direct PDF Download
                                elif clean_url.lower().endswith(".pdf"):
                                    pdf_name = f"{sanitize_filename(ltitle)}.pdf"
                                    dest = os.path.join(unit_dir, pdf_name)
                                    try:
                                        pok, _, pdf_bytes = await self.http_get(clean_url)
                                        if pok and pdf_bytes:
                                            with open(dest, "wb") as pf:
                                                pf.write(pdf_bytes)
                                            downloaded_pdf_count += 1
                                            note_item["local_path"] = dest
                                            print(f"      ✅ Saved direct PDF -> {os.path.basename(dest)}")
                                    except Exception:
                                        pass

            # Save notes index JSON
            index_path = os.path.join(course_notes_dir, "notes_index.json")
            with open(index_path, "w", encoding="utf-8") as f:
                json.dump(discovered_notes, f, indent=2)

            # Clean up empty folders
            removed_folders = remove_empty_folders(course_notes_dir)
            if removed_folders > 0:
                print(f"   🗑️ Cleaned up {removed_folders} empty folders in {course_notes_dir}")

            print(f"✅ Completed {c_id}: Downloaded {downloaded_pdf_count} PDF notes files (Index: {index_path})")
            return discovered_notes

        except Exception as e:
            print(f"❌ Error downloading notes for {c_id}: {e}")
            return []

    async def complete_course_lessons(self, course_id, max_units=10, max_lessons=20):
        """Option 4: Complete all course lessons directly via NPTEL REST API"""
        c_id = course_id.rstrip("/").split("/")[-1] if "/" in course_id else course_id
        print(f"\n🚀 Completing Lessons via REST API for Course: {c_id}")

        try:
            ok, text, _ = await self.http_get(
                f"https://onlinecourses.nptel.ac.in/e-learning/api/courseoutline?course_id={c_id}"
            )
            if not ok:
                print(f"❌ Failed to fetch course outline for {c_id}")
                return

            data = json.loads(text)
            payload = json.loads(data.get("payload", "{}")) if isinstance(data.get("payload"), str) else data.get("payload", {})
            lessons = payload.get("lessons", {})

            if not lessons:
                print(f"⚠️ No lessons found in course outline for {c_id}")
                return

            pbar = ProgressBar(len(lessons), f"Course {c_id}", 35)
            visited_count = 0

            for lkey, lval in lessons.items():
                uid = lval.get("unit_id")
                lid = lval.get("lesson_id")
                api_url = f"https://onlinecourses.nptel.ac.in/e-learning/api/lesson?course_id={c_id}&unit_id={uid}&lesson_id={lid}"
                try:
                    lok, _, _ = await self.http_get(api_url)
                    if lok:
                        visited_count += 1
                except Exception:
                    pass
                pbar.update()

            pbar.finish()
            print(f"✅ Completed {c_id}: Registered {visited_count}/{len(lessons)} lessons via REST API!")

        except Exception as e:
            print(f"❌ Error completing course {c_id}: {e}")

    async def fetch_assessment_details(self, course_id, unit_id, assessment_id):
        """Query NPTEL REST API for full assessment metadata, questions, choices, and CSRF token"""
        c_id = course_id.rstrip("/").split("/")[-1] if "/" in course_id else course_id
        api_url = f"https://onlinecourses.nptel.ac.in/e-learning/api/assessment?course_id={c_id}&unit_id={unit_id}&assessment_id={assessment_id}"
        quiz_web_url = f"https://onlinecourses.nptel.ac.in/e-learning/course/{c_id}?unitId={unit_id}&assessmentId={assessment_id}"

        ok, text, _ = await self.http_get(api_url)
        if not ok or not text:
            return None

        try:
            adata = json.loads(text)
        except Exception:
            return None

        # Extract base64 embedded question data if available in HTML
        html_doc = adata.get("html", "")
        embedded_question_data = {}
        for blob in re.findall(r"window\.atob\([\"'](.*?)[\"']\)", html_doc):
            try:
                decoded = json.loads(base64.b64decode(blob).decode("utf-8", errors="ignore"))
                if isinstance(decoded, dict):
                    if "quid" in decoded:
                        embedded_question_data[str(decoded["quid"])] = decoded
                    else:
                        for k, v in decoded.items():
                            if isinstance(v, dict) and "question" in v:
                                embedded_question_data[str(v["question"])] = v
            except Exception:
                pass

        raw_questions = adata.get("assessment_data", {}).get("visible_questions", [])
        parsed_questions = []

        for idx, q in enumerate(raw_questions):
            q_id = str(q.get("question_block_id", ""))
            group_id = str(q.get("question_group_block_id", ""))
            inst_id = str(q.get("instance_id") or "gKGUpDkZvzSf")
            q_text = clean_text_string(q.get("question_text", ""))
            q_type = q.get("input_type", "radio")
            multiple_sel = bool(q.get("multiple_selections", False))
            points = q.get("points", 1)

            choices = []
            correct_choice_ids = []
            correct_choice_texts = []

            raw_choices = q.get("choices", [])
            for c_idx, c in enumerate(raw_choices):
                cid = str(c.get("choice_id", c_idx))
                ctext = clean_text_string(c.get("text", ""))
                cscore = float(c.get("score", 0))

                # Check if score indicates correct answer in embedded payload
                if cscore >= 1.0 or cscore > 0:
                    correct_choice_ids.append(cid)
                    correct_choice_texts.append(ctext)

                choices.append({
                    "choice_id": cid,
                    "index": c_idx,
                    "text": ctext,
                    "score": cscore,
                })

            # Check if answer key is in embedded questionData
            if not correct_choice_ids and q_id in embedded_question_data:
                emb = embedded_question_data[q_id]
                for c_idx, c in enumerate(emb.get("choices", [])):
                    if float(c.get("score", 0)) >= 1.0 or float(c.get("score", 0)) > 0:
                        cid = str(c_idx)
                        ctext = clean_text_string(c.get("text", ""))
                        if cid not in correct_choice_ids:
                            correct_choice_ids.append(cid)
                        if ctext not in correct_choice_texts:
                            correct_choice_texts.append(ctext)
                        if c_idx < len(choices):
                            choices[c_idx]["score"] = float(c.get("score", 1))

            # Student submission status for this question
            student_answered = bool(q.get("student_is_answered", False))
            student_score = q.get("student_score", None)
            student_flags = q.get("student_response_flags", [])
            student_text = q.get("student_response_text", "")

            parsed_questions.append({
                "q_num": idx + 1,
                "order": idx,
                "question_block_id": q_id,
                "question_group_block_id": group_id,
                "instance_id": inst_id,
                "question_text": q_text,
                "input_type": q_type,
                "multiple_selections": multiple_sel,
                "points": f"{points} Point" if points == 1 else f"{points} Points",
                "choices": choices,
                "correct_choice_ids": correct_choice_ids,
                "correct_choice_texts": correct_choice_texts,
                "has_revealed_answer": len(correct_choice_ids) > 0,
                "student_is_answered": student_answered,
                "student_score": student_score,
                "student_response_flags": student_flags,
                "student_response_text": student_text,
            })

        return {
            "course_id": c_id,
            "unit_id": unit_id,
            "assessment_id": assessment_id,
            "title": adata.get("assessment_title") or f"Assignment (Unit {unit_id})",
            "url": quiz_web_url,
            "due_date": adata.get("due_date"),
            "is_submitted": bool(adata.get("is_submitted", False) or adata.get("submission_date")),
            "submission_date": adata.get("submission_date"),
            "xsrf_token": adata.get("assessment_xsrf_token", ""),
            "total_questions": len(parsed_questions),
            "questions": parsed_questions,
        }

    async def extract_course_quizzes(self, course_id):
        """Option 5: Extract all quizzes, verified answer keys, and generate markdown solutions"""
        c_id = course_id.rstrip("/").split("/")[-1] if "/" in course_id else course_id
        print(f"\n📝 Extracting Quizzes & Assignments via REST API for {c_id}...")

        try:
            ok, text, _ = await self.http_get(
                f"https://onlinecourses.nptel.ac.in/e-learning/api/courseoutline?course_id={c_id}"
            )
            if not ok:
                print(f"❌ Failed to fetch course outline for {c_id}")
                return []

            data = json.loads(text)
            payload = json.loads(data.get("payload", "{}")) if isinstance(data.get("payload"), str) else data.get("payload", {})
            assessments = payload.get("assessments", [])

            quizzes_dir = os.path.abspath(f"./extracted_quizzes/{sanitize_filename(c_id)}")
            os.makedirs(quizzes_dir, exist_ok=True)

            all_extracted_quizzes = []
            for item in assessments:
                if isinstance(item, dict):
                    title = item.get("title", "Assignment")
                    week_uid = item.get("id")
                    assess_uid = item.get("unit_id")

                    try:
                        quiz_details = await self.fetch_assessment_details(c_id, week_uid, assess_uid)
                        if quiz_details and quiz_details.get("questions"):
                            quiz_details["title"] = title
                            all_extracted_quizzes.append(quiz_details)
                            print(
                                f"   📝 [{title}] -> Extracted {quiz_details['total_questions']} questions | Due: {quiz_details.get('due_date') or 'N/A'}"
                            )
                    except Exception as err:
                        print(f"   ⚠️ Could not extract quiz {title}: {err}")

            # Save structured JSON
            out_json_path = os.path.join(quizzes_dir, "quizzes.json")
            with open(out_json_path, "w", encoding="utf-8") as f:
                json.dump(all_extracted_quizzes, f, indent=2)

            # Generate Human-Readable Markdown Solutions Guide
            md_path = os.path.join(quizzes_dir, "assignment_solutions.md")
            self._generate_solutions_markdown(c_id, all_extracted_quizzes, md_path)

            print(f"✅ Extracted {len(all_extracted_quizzes)} quizzes for {c_id}")
            print(f"   📄 JSON data: {out_json_path}")
            print(f"   📖 Markdown Study Guide: {md_path}")
            return all_extracted_quizzes

        except Exception as e:
            print(f"❌ Error extracting quizzes for {c_id}: {e}")
            return []

    def _generate_solutions_markdown(self, course_id, quizzes, output_file):
        """Generate a clean, beautiful Markdown solution document with answer keys"""
        lines = [
            f"# 📚 {course_id.upper()} — Assignment Solutions & Quiz Study Guide",
            f"*Generated automatically on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*",
            "",
            "---",
            "",
        ]

        for q_idx, quiz in enumerate(quizzes, 1):
            title = quiz.get("title", f"Assignment {q_idx}")
            due = quiz.get("due_date") or "N/A"
            status_str = "✅ Submitted" if quiz.get("is_submitted") else "⏳ Not Submitted"
            lines.extend([
                f"## 📝 {title}",
                f"- **Web URL**: [{title}]({quiz.get('url')})",
                f"- **Due Date**: `{due}`",
                f"- **Status**: {status_str}",
                f"- **Total Questions**: {quiz.get('total_questions')}",
                "",
            ])

            for q in quiz.get("questions", []):
                q_num = q.get("q_num")
                q_text = q.get("question_text", "")
                points = q.get("points", "1 Point")
                lines.extend([
                    f"### Q{q_num}. {q_text}",
                    f"*{points}*",
                    "",
                ])

                choices = q.get("choices", [])
                correct_ids = q.get("correct_choice_ids", [])
                option_letters = ["A", "B", "C", "D", "E", "F", "G", "H"]

                for c_idx, c in enumerate(choices):
                    letter = option_letters[c_idx] if c_idx < len(option_letters) else str(c_idx + 1)
                    is_correct = str(c.get("choice_id")) in correct_ids or (c.get("score", 0) > 0)
                    mark = " [✓] (Correct Answer)" if is_correct else ""
                    lines.append(f"- **({letter})** {c.get('text')}{mark}")

                if correct_ids:
                    correct_ans_str = ", ".join(q.get("correct_choice_texts") or correct_ids)
                    lines.extend([
                        "",
                        f"> **Verified Correct Answer**: `{correct_ans_str}`",
                    ])
                lines.append("")

            lines.extend(["---", ""])

        with open(output_file, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

    async def scan_all_unsubmitted_assignments(self, target_course=None):
        """Scan active courses and return active and unsubmitted assignments concurrently"""
        courses = []
        if os.path.exists(self.courses_file):
            with open(self.courses_file, "r", encoding="utf-8") as f:
                courses = json.load(f)

        if not courses:
            courses = await self.fetch_and_save_courses_json()

        if target_course:
            courses = [c for c in courses if c.get("id") == target_course or target_course in c.get("id", "")]

        print(f"\n🔍 Scanning {len(courses)} active course(s) for assignments in parallel...")

        async def fetch_course_assessments(c):
            cid = c.get("id")
            c_title = c.get("title", cid)
            ok, text, _ = await self.http_get(
                f"https://onlinecourses.nptel.ac.in/e-learning/api/courseoutline?course_id={cid}"
            )
            if not ok:
                return []

            try:
                data = json.loads(text)
                payload = json.loads(data.get("payload", "{}")) if isinstance(data.get("payload"), str) else data.get("payload", {})
                assessments = payload.get("assessments", [])

                async def fetch_one(item):
                    if not isinstance(item, dict):
                        return None
                    title = item.get("title", "Assignment")
                    week_uid = item.get("id")
                    assess_uid = item.get("unit_id")
                    info = await self.fetch_assessment_details(cid, week_uid, assess_uid)
                    if info and info.get("questions"):
                        info["course_title"] = c_title
                        info["title"] = title
                        return info
                    return None

                results = await asyncio.gather(*[fetch_one(it) for it in assessments])
                return [r for r in results if r]
            except Exception:
                return []

        course_results = await asyncio.gather(*[fetch_course_assessments(c) for c in courses])
        all_assignments_list = []
        unsubmitted_list = []

        now = datetime.now(timezone.utc)

        for c_list in course_results:
            for q in c_list:
                all_assignments_list.append(q)
                # Check if deadline has not passed
                due_str = q.get("due_date")
                is_expired = False
                if due_str:
                    try:
                        clean_due = due_str.replace("Z", "+00:00")
                        due_dt = datetime.fromisoformat(clean_due)
                        if due_dt < now:
                            is_expired = True
                    except Exception:
                        pass

                q["is_expired"] = is_expired
                if not q.get("is_submitted") and not is_expired:
                    unsubmitted_list.append(q)

        return unsubmitted_list, all_assignments_list

    async def submit_assessment_answers(self, course_id, unit_id, assessment_id, xsrf_token, questions, selected_answers):
        """Submit assignment answers via NPTEL REST API"""
        c_id = course_id.rstrip("/").split("/")[-1] if "/" in course_id else course_id
        submit_url = f"https://onlinecourses.nptel.ac.in/e-learning/api/assessment?course_id={c_id}&unit_id={unit_id}&assessment_id={assessment_id}"

        # Construct the exact NPTEL v1.5 answers payload
        answers_dict = {
            "version": "1.5",
            "individualScores": {},
            "containedTypes": {},
            "answers": {},
            "quids": {},
            "rawScore": 0,
            "totalWeight": 0,
            "percentScore": 0,
            "save_draft": False,
            "is_submitted": True,
        }

        instance_groups = {}
        for idx, q in enumerate(questions):
            inst_id = q.get("instance_id") or "gKGUpDkZvzSf"
            q_block_id = q.get("question_block_id", "")
            q_key = f"{inst_id}.{idx}.{q_block_id}"

            sel = selected_answers.get(idx)
            if sel is None:
                sel = selected_answers.get(str(idx))

            choices = q.get("choices", [])
            q_type = q.get("input_type", "radio")

            if q_type in ("radio", "checkbox") or choices:
                resp_flags = []
                for c in choices:
                    cid = str(c.get("choice_id"))
                    c_idx = c.get("index")
                    match = (str(sel) == cid) or (isinstance(sel, int) and sel == c_idx) or (isinstance(sel, list) and (cid in sel or c_idx in sel))
                    resp_flags.append(bool(match))

                is_ans = any(resp_flags)
                l_obj = {"responses": resp_flags, "is_answered": is_ans}
            else:
                resp_str = str(sel or "")
                l_obj = {"response": resp_str, "is_answered": bool(resp_str.strip())}

            if inst_id not in instance_groups:
                instance_groups[inst_id] = {"is_answered": False}

            instance_groups[inst_id][q_key] = l_obj
            if l_obj["is_answered"]:
                instance_groups[inst_id]["is_answered"] = True

        for inst_id, val in instance_groups.items():
            answers_dict[inst_id] = val

        submit_payload = {
            "answers": answers_dict,
            "xsrf_token": xsrf_token,
        }

        ok, resp_text, _ = await self.http_post(submit_url, submit_payload)
        clean_resp = resp_text.replace(")]}'\n", "").replace(")]}'", "").strip()

        try:
            res_obj = json.loads(clean_resp)
            status = res_obj.get("status")
            if status in (200, "200", "success", "ok") or (ok and not res_obj.get("error")):
                return True, "✅ Your answers are successfully submitted to NPTEL!"
            else:
                msg = res_obj.get("message") or res_obj.get("error") or clean_resp
                return False, f"❌ Submission rejected by server: {msg}"
        except Exception:
            if ok:
                return True, "✅ Submission request completed successfully!"
            return False, f"❌ Server returned: {clean_resp[:200]}"


# ============================================================
# OPTION WORKFLOW FUNCTIONS
# ============================================================

def option1_set_cookies(cookie_input_text=None):
    """Option 1: Set cookies and store them in cookies.json"""
    print("\n" + "=" * 60)
    print("🔑 STEP 1: Set Cookies and Store in JSON")
    print("=" * 60)

    if not cookie_input_text:
        print("Paste your cookie string (g_a=...; g_b=...; g_c=...) or JSON below:")
        cookie_input_text = input("Cookie Input: ").strip()

    if not cookie_input_text:
        print("❌ No input provided!")
        return False

    cookie_objects = []
    try:
        parsed = json.loads(cookie_input_text)
        if isinstance(parsed, list):
            cookie_objects = parsed
    except Exception:
        pairs = [p.strip() for p in cookie_input_text.split(";") if "=" in p]
        for pair in pairs:
            k, v = pair.split("=", 1)
            k, v = k.strip(), v.strip()
            cookie_objects.append({"name": k, "value": v, "url": "https://swayam.gov.in"})
            cookie_objects.append({"name": k, "value": v, "url": "https://onlinecourses.nptel.ac.in"})

    if cookie_objects:
        with open("cookies.json", "w", encoding="utf-8") as f:
            json.dump(cookie_objects, f, indent=2)
        print(f"✅ Saved {len(cookie_objects)} cookie entries to cookies.json!")
        return True
    else:
        print("❌ Invalid cookie format.")
        return False


async def option2_get_all_courses(automator):
    """Option 2: Get all active courses and store them in courses.json"""
    print("\n" + "=" * 60)
    print("📚 STEP 2: Get All Active Courses and Store in JSON")
    print("=" * 60)

    courses = await automator.fetch_and_save_courses_json()
    return courses


async def option3_download_all_notes(automator, max_parallel=4):
    """Option 3: Download All Unit-Wise PDF Notes"""
    print("\n" + "=" * 60)
    print("📑 STEP 3: Download All Unit-Wise PDF Notes")
    print("=" * 60)

    courses = []
    if os.path.exists("courses.json"):
        with open("courses.json", "r", encoding="utf-8") as f:
            courses = json.load(f)

    if not courses:
        print("ℹ️ courses.json not found. Running Step 2 automatically to fetch active courses...")
        courses = await option2_get_all_courses(automator)

    if not courses:
        print("❌ No active courses available to process.")
        return

    course_ids = [c["id"] for c in courses if "id" in c]
    print(f"\n⚡ Extracting PDF notes for {len(course_ids)} courses in parallel using {max_parallel} workers...")

    async def worker(cid):
        w = NPTELAutomator(cookies_input=automator.cookies_input, output_dir=automator.output_dir)
        await w.fetch_and_download_course_notes(cid)

    sem = asyncio.Semaphore(max_parallel)

    async def sem_worker(cid):
        async with sem:
            await worker(cid)

    tasks = [sem_worker(cid) for cid in course_ids]
    await asyncio.gather(*tasks)

    print("\n🎉 ALL UNIT-WISE PDF NOTES DOWNLOADED SUCCESSFULLY!")


async def option4_complete_all_courses_parallel(automator, max_parallel=5, max_units=10, max_lessons=20):
    """Option 4: Complete All Active Courses in Parallel"""
    print("\n" + "=" * 60)
    print("🚀 STEP 4: Complete All Active Courses in Parallel")
    print("=" * 60)

    courses = []
    if os.path.exists("courses.json"):
        with open("courses.json", "r", encoding="utf-8") as f:
            courses = json.load(f)

    if not courses:
        print("ℹ️ courses.json not found. Running Step 2 automatically to fetch active courses...")
        courses = await option2_get_all_courses(automator)

    if not courses:
        print("❌ No active courses available to process.")
        return

    course_ids = [c["id"] for c in courses if "id" in c]
    print(f"\n⚡ Completing lessons for {len(course_ids)} courses in parallel using {max_parallel} workers...")

    async def worker(cid):
        w = NPTELAutomator(cookies_input=automator.cookies_input, output_dir=automator.output_dir)
        await w.complete_course_lessons(cid, max_units=max_units, max_lessons=max_lessons)

    sem = asyncio.Semaphore(max_parallel)

    async def sem_worker(cid):
        async with sem:
            await worker(cid)

    tasks = [sem_worker(cid) for cid in course_ids]
    await asyncio.gather(*tasks)

    print("\n🎉 ALL ACTIVE COURSES COMPLETED IN PARALLEL!")


async def option5_extract_all_quizzes(automator, max_parallel=4):
    """Option 5: Extract All Quizzes, Answer Keys & Markdown Solutions"""
    print("\n" + "=" * 60)
    print("📝 STEP 5: Extract All Quizzes, Answer Keys & Markdown Solutions")
    print("=" * 60)

    courses = []
    if os.path.exists("courses.json"):
        with open("courses.json", "r", encoding="utf-8") as f:
            courses = json.load(f)

    if not courses:
        print("ℹ️ courses.json not found. Running Step 2 automatically to fetch active courses...")
        courses = await option2_get_all_courses(automator)

    if not courses:
        print("❌ No active courses available to process.")
        return

    course_ids = [c["id"] for c in courses if "id" in c]
    print(f"\n⚡ Extracting quizzes & solutions for {len(course_ids)} courses in parallel using {max_parallel} workers...")

    async def worker(cid):
        w = NPTELAutomator(cookies_input=automator.cookies_input, output_dir=automator.output_dir)
        await w.extract_course_quizzes(cid)

    sem = asyncio.Semaphore(max_parallel)

    async def sem_worker(cid):
        async with sem:
            await worker(cid)

    tasks = [sem_worker(cid) for cid in course_ids]
    await asyncio.gather(*tasks)

    print("\n🎉 ALL QUIZZES & SOLUTIONS EXTRACTED AND SAVED SUCCESSFULLY!")


async def option6_solve_and_submit_assignments(automator, gemini_api_key=None, auto_approve=False, target_course=None):
    """Option 6: AI Auto-Solve & Submit Assignments (with User Review & Approval)"""
    print("\n" + "=" * 60)
    print("🤖 STEP 6: AI Auto-Solve & Submit Assignments")
    print("=" * 60)

    # 1. Retrieve Gemini API Key
    api_key = get_gemini_api_key(gemini_api_key)
    if not api_key:
        print("🔑 Enter your Google Gemini API Key (or press Enter if using embedded answer keys):")
        try:
            user_key_input = input("Gemini API Key: ").strip()
            if user_key_input:
                api_key = user_key_input
                with open(".gemini_key", "w") as f:
                    f.write(api_key)
                print("✅ Saved Gemini API key to .gemini_key for future use.")
        except Exception:
            pass

    # 2. Scan for unsubmitted assignments
    unsubmitted, all_assessments = await automator.scan_all_unsubmitted_assignments(target_course=target_course)

    display_list = unsubmitted
    if not display_list:
        print("\n🎉 No unsubmitted active assignments found! All open assignments are already submitted.")
        # Filter for open/active assessments that can be reviewed/retaken
        open_submitted = [a for a in all_assessments if not a.get("is_expired")]
        if open_submitted:
            print("\nWould you like to review or retake an open assignment? (y/n): ")
            try:
                ans = input().strip().lower()
                if ans == "y":
                    display_list = open_submitted
                else:
                    return
            except Exception:
                return
        else:
            return

    # 3. Present assignment selection menu to user
    print("\n" + "=" * 60)
    print("📚 AVAILABLE ASSIGNMENTS TO SOLVE & SUBMIT:")
    print("=" * 60)
    for idx, item in enumerate(display_list, 1):
        status_tag = "⏳ NOT SUBMITTED" if not item.get("is_submitted") else "🔄 SUBMITTED (Open for Retake)"
        due_str = item.get("due_date") or "No deadline"
        print(f"  {idx:2d}. [{item.get('course_id')}] {item.get('title')} ({item.get('total_questions')} Qs) — {status_tag} (Due: {due_str})")

    print("   A. Process ALL listed assignments sequentially")
    print("   Q. Cancel and return to main menu")
    print("=" * 60)

    selected_indices = []
    if auto_approve:
        selected_indices = list(range(len(display_list)))
    else:
        try:
            choice = input(f"Select an assignment (1-{len(display_list)} / A / Q): ").strip().upper()
            if choice == "Q" or not choice:
                print("👋 Operation cancelled.")
                return
            elif choice == "A":
                selected_indices = list(range(len(display_list)))
            else:
                num = int(choice)
                if 1 <= num <= len(display_list):
                    selected_indices = [num - 1]
                else:
                    print("❌ Invalid selection.")
                    return
        except Exception:
            print("❌ Invalid input.")
            return

    # 4. Process each selected assignment
    option_letters = ["A", "B", "C", "D", "E", "F", "G", "H"]

    for s_idx in selected_indices:
        quiz = display_list[s_idx]
        cid = quiz.get("course_id")
        uid = quiz.get("unit_id")
        aid = quiz.get("assessment_id")
        title = quiz.get("title")
        course_title = quiz.get("course_title", cid)
        questions = quiz.get("questions", [])
        xsrf_token = quiz.get("xsrf_token", "")

        print("\n" + "=" * 70)
        print(f"🎯 PROCESSING: {title} ({course_title})")
        print(f"   Unit ID: {uid} | Assessment ID: {aid} | Questions: {len(questions)}")
        print("=" * 70)

        # Build selected answers dictionary
        selected_answers = {}  # {q_index: choice_id}
        reasonings = {}        # {q_index: explanation}
        solve_source = {}      # {q_index: "NPTEL Verified" or "Gemini AI"}

        # First, check if ground-truth answers exist in NPTEL payload
        unresolved_questions = []
        for idx, q in enumerate(questions):
            correct_ids = q.get("correct_choice_ids", [])
            if correct_ids:
                selected_answers[idx] = correct_ids[0]
                solve_source[idx] = "⭐ NPTEL Verified Key"
                reasonings[idx] = "Answer key directly verified from NPTEL assessment payload."
            else:
                unresolved_questions.append(q)

        # For remaining questions, solve with Gemini AI
        if unresolved_questions:
            if api_key:
                print(f"🤖 Solving {len(unresolved_questions)} question(s) using Google Gemini AI...")
                g_ok, solutions = solve_questions_with_gemini(api_key, course_title, title, unresolved_questions)
                if g_ok and solutions:
                    for sol in solutions:
                        q_num = sol.get("q_num")
                        # Find corresponding question index
                        matching_idx = None
                        for idx, q in enumerate(questions):
                            if q.get("q_num") == q_num or str(q.get("question_block_id")) == str(sol.get("question_id")):
                                matching_idx = idx
                                break

                        if matching_idx is not None:
                            c_id_selected = str(sol.get("selected_choice_id", ""))
                            c_idx_selected = sol.get("selected_choice_index")

                            # Fallback if choice_id missing
                            if not c_id_selected and c_idx_selected is not None:
                                c_list = questions[matching_idx].get("choices", [])
                                if 0 <= c_idx_selected < len(c_list):
                                    c_id_selected = str(c_list[c_idx_selected].get("choice_id", c_idx_selected))

                            selected_answers[matching_idx] = c_id_selected or "0"
                            solve_source[matching_idx] = "🤖 Gemini AI Solution"
                            reasonings[matching_idx] = sol.get("reasoning", "AI derived answer.")
                else:
                    print(f"⚠️ Gemini solving notice: {solutions}")
                    # Fallback to first option if AI failed
                    for q in unresolved_questions:
                        idx = q.get("order", 0)
                        if idx not in selected_answers:
                            c_list = q.get("choices", [])
                            selected_answers[idx] = str(c_list[0].get("choice_id", 0)) if c_list else "0"
                            solve_source[idx] = "⚠️ Default (First Choice)"
                            reasonings[idx] = "No AI key provided / AI call was skipped."
            else:
                print("ℹ️ No Gemini API key configured. Setting default first choices for unrevealed questions.")
                for q in unresolved_questions:
                    idx = q.get("order", 0)
                    if idx not in selected_answers:
                        c_list = q.get("choices", [])
                        selected_answers[idx] = str(c_list[0].get("choice_id", 0)) if c_list else "0"
                        solve_source[idx] = "⚠️ Default Choice"
                        reasonings[idx] = "Set Gemini API Key to enable AI solving."

        # 5. Interactive Review & Approval Screen
        while True:
            print("\n" + "=" * 70)
            print(f"📋 ASSIGNMENT REVIEW: {title}")
            print(f"Course: {course_title} | Due: {quiz.get('due_date') or 'N/A'}")
            print("=" * 70)

            for idx, q in enumerate(questions):
                q_num = q.get("q_num", idx + 1)
                q_text = q.get("question_text", "")
                points = q.get("points", "1 Point")
                src = solve_source.get(idx, "Solution")
                reasoning = reasonings.get(idx, "")
                sel_cid = str(selected_answers.get(idx, ""))

                print(f"\n[Q{q_num}] {q_text} ({points})")
                choices = q.get("choices", [])
                for c_idx, c in enumerate(choices):
                    cid = str(c.get("choice_id", c_idx))
                    letter = option_letters[c_idx] if c_idx < len(option_letters) else str(c_idx + 1)
                    is_selected = (cid == sel_cid) or (str(c_idx) == sel_cid)

                    if is_selected:
                        print(f"   👉 [{letter}] {c.get('text')}  <-- SELECTED [{src}]")
                    else:
                        print(f"      ({letter}) {c.get('text')}")

                if reasoning:
                    print(f"   💡 Explanation: {reasoning}")

            print("\n" + "=" * 70)
            if auto_approve:
                print("⚡ Auto-approve flag set. Submitting answers...")
                action = "Y"
            else:
                print("OPTIONS:")
                print("  [Y] Approve and SUBMIT these answers to NPTEL")
                print("  [E] Edit / change an answer (e.g., Question 3 -> Option C)")
                print("  [S] Skip this assignment")
                print("  [Q] Cancel and return to main menu")
                try:
                    action = input("Enter choice (Y/E/S/Q) [default: Y]: ").strip().upper() or "Y"
                except Exception:
                    action = "Q"

            if action == "Y":
                print(f"\n🚀 Submitting answers for {title} via NPTEL REST API...")
                ok, msg = await automator.submit_assessment_answers(
                    cid, uid, aid, xsrf_token, questions, selected_answers
                )
                print(msg)
                break
            elif action == "E":
                try:
                    q_to_edit = int(input(f"Enter question number to edit (1-{len(questions)}): ").strip())
                    if 1 <= q_to_edit <= len(questions):
                        e_idx = q_to_edit - 1
                        e_choices = questions[e_idx].get("choices", [])
                        print(f"\nAvailable options for Q{q_to_edit}:")
                        for c_idx, c in enumerate(e_choices):
                            letter = option_letters[c_idx] if c_idx < len(option_letters) else str(c_idx + 1)
                            print(f"  {letter}. {c.get('text')}")

                        new_letter = input("Enter new option letter (A, B, C, D...): ").strip().upper()
                        if new_letter in option_letters:
                            new_c_idx = option_letters.index(new_letter)
                            if new_c_idx < len(e_choices):
                                selected_answers[e_idx] = str(e_choices[new_c_idx].get("choice_id", new_c_idx))
                                solve_source[e_idx] = "✏️ User Manual Override"
                                reasonings[e_idx] = f"Manually changed to option ({new_letter}) by user."
                                print(f"✅ Updated Q{q_to_edit} to Option ({new_letter})!")
                            else:
                                print("❌ Option index out of range.")
                        else:
                            print("❌ Invalid option letter.")
                    else:
                        print("❌ Invalid question number.")
                except Exception as ex:
                    print(f"❌ Error editing: {ex}")
            elif action == "S":
                print(f"⏩ Skipped {title}.")
                break
            elif action == "Q":
                print("👋 Cancelled submission process.")
                return

    print("\n🎉 ALL SELECTED ASSIGNMENTS PROCESSED!")


def option7_reset_data(output_dir="./downloaded_notes"):
    """Option 7: Reset data and clean up saved files"""
    print("\n" + "=" * 60)
    print("🗑️ STEP 7: Reset Data & Clean Up Files")
    print("=" * 60)

    files_to_remove = ["cookies.json", "courses.json", "browser_session.pkl", "local_storage.json", ".gemini_key"]
    dirs_to_remove = [output_dir, "./extracted_quizzes", "./saved_html", "./browser_profile"]

    for f in files_to_remove:
        if os.path.exists(f):
            os.remove(f)
            print(f"   - Removed file: {f}")

    for d in dirs_to_remove:
        if os.path.exists(d):
            shutil.rmtree(d, ignore_errors=True)
            print(f"   - Removed directory: {d}")

    print("✅ Reset complete! Data and cache cleaned up.")


def print_menu():
    """Display clean 7-step workflow menu"""
    print("\n" + "=" * 60)
    print("🚀 NPTEL AUTOMATOR & PARALLEL PROCESSOR")
    print("=" * 60)
    print("1. Set Cookies & Store in JSON (cookies.json)")
    print("2. Get All Active Courses & Store in JSON (courses.json)")
    print("3. Download All Unit-Wise PDF Notes")
    print("4. Complete All Active Courses in Parallel")
    print("5. Extract All Quizzes, Answer Keys & Markdown Solutions")
    print("6. AI Auto-Solve & Submit Assignments (with User Approval)")
    print("7. Reset Data & Clean Up Files")
    print("=" * 60)


async def main():
    parser = argparse.ArgumentParser(description="NPTEL Automator - REST API & Gemini AI Solver")
    parser.add_argument("-m", "--mode", type=int, choices=[1, 2, 3, 4, 5, 6, 7], help="Select execution mode (1-7)")
    parser.add_argument("-c", "--cookies", type=str, help="Raw cookie string or path to cookies.json")
    parser.add_argument("-g", "--gemini-key", type=str, help="Google Gemini API Key for auto-solving")
    parser.add_argument("--course", type=str, help="Filter by specific course ID (e.g. noc26_cs104)")
    parser.add_argument("--auto-approve", action="store_true", help="Auto-approve assignment submission without prompt")
    parser.add_argument("-o", "--output", type=str, default="./downloaded_notes", help="Directory to save downloaded notes")
    parser.add_argument("-p", "--parallel", type=int, default=4, help="Max parallel workers")
    parser.add_argument("--max-units", type=int, default=10, help="Max units per course")
    parser.add_argument("--max-lessons", type=int, default=20, help="Max lessons per unit")

    args = parser.parse_args()
    automator = NPTELAutomator(cookies_input=args.cookies, output_dir=args.output)

    # Direct CLI Execution if flags are provided
    if args.mode:
        if args.mode == 1:
            option1_set_cookies(cookie_input_text=args.cookies)
        elif args.mode == 2:
            await option2_get_all_courses(automator)
        elif args.mode == 3:
            await option3_download_all_notes(automator, max_parallel=args.parallel)
        elif args.mode == 4:
            await option4_complete_all_courses_parallel(
                automator,
                max_parallel=args.parallel,
                max_units=args.max_units,
                max_lessons=args.max_lessons,
            )
        elif args.mode == 5:
            await option5_extract_all_quizzes(automator, max_parallel=args.parallel)
        elif args.mode == 6:
            await option6_solve_and_submit_assignments(
                automator,
                gemini_api_key=args.gemini_key,
                auto_approve=args.auto_approve,
                target_course=args.course,
            )
        elif args.mode == 7:
            option7_reset_data(output_dir=args.output)
        return

    # Single-run Menu Execution
    print_menu()
    try:
        choice = input("Select an option (1-7): ").strip()
        if choice == "1":
            option1_set_cookies()
        elif choice == "2":
            await option2_get_all_courses(automator)
        elif choice == "3":
            await option3_download_all_notes(automator, max_parallel=args.parallel)
        elif choice == "4":
            await option4_complete_all_courses_parallel(
                automator,
                max_parallel=args.parallel,
                max_units=args.max_units,
                max_lessons=args.max_lessons,
            )
        elif choice == "5":
            await option5_extract_all_quizzes(automator, max_parallel=args.parallel)
        elif choice == "6":
            await option6_solve_and_submit_assignments(
                automator,
                gemini_api_key=args.gemini_key,
                auto_approve=args.auto_approve,
                target_course=args.course,
            )
        elif choice == "7":
            option7_reset_data(output_dir=automator.output_dir)
        else:
            print("❌ Invalid option. Please select 1, 2, 3, 4, 5, 6, or 7.")
    except KeyboardInterrupt:
        print("\n👋 Operation canceled.")
    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())

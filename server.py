import argparse
import asyncio
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from app import (
    NPTELAutomator,
    get_gemini_api_key,
    option1_set_cookies,
    solve_questions_with_gemini,
)


class NPTELApiHandler(BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def _send_json(self, status_code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self._send_cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        automator = NPTELAutomator()

        if path == "/api/status":
            courses = []
            if os.path.exists("courses.json"):
                try:
                    with open("courses.json") as f:
                        courses = json.load(f)
                except Exception:
                    pass

            gemini_key = get_gemini_api_key()
            has_gemini = bool(gemini_key)

            self._send_json(200, {
                "cookies_loaded": bool(automator.cookie_str),
                "courses_count": len(courses),
                "has_gemini_key": has_gemini,
                "output_dir": automator.output_dir,
            })

        elif path == "/api/courses":
            courses = []
            if os.path.exists("courses.json"):
                try:
                    with open("courses.json") as f:
                        courses = json.load(f)
                except Exception:
                    pass
            self._send_json(200, {"courses": courses})

        elif path == "/api/assignments":
            target = params.get("course_id", [None])[0]
            unsub, all_a = asyncio.run(automator.scan_all_unsubmitted_assignments(target_course=target))
            self._send_json(200, {
                "unsubmitted": unsub,
                "all": all_a,
            })

        elif path == "/api/quizzes":
            cid = params.get("course_id", [""])[0]
            quizzes_file = f"./extracted_quizzes/{cid}/quizzes.json"
            solutions_file = f"./extracted_quizzes/{cid}/assignment_solutions.md"
            quizzes = []
            solutions_md = ""

            if os.path.exists(quizzes_file):
                try:
                    with open(quizzes_file) as f:
                        quizzes = json.load(f)
                except Exception:
                    pass

            if os.path.exists(solutions_file):
                try:
                    with open(solutions_file) as f:
                        solutions_md = f.read()
                except Exception:
                    pass

            self._send_json(200, {
                "quizzes": quizzes,
                "solutions_markdown": solutions_md,
            })

        elif path == "/api/notes":
            cid = params.get("course_id", [""])[0]
            notes_file = f"./downloaded_notes/{cid}/notes_index.json"
            notes = []
            if os.path.exists(notes_file):
                try:
                    with open(notes_file) as f:
                        notes = json.load(f)
                except Exception:
                    pass
            self._send_json(200, {"notes": notes})

        else:
            self._send_json(404, {"error": "Endpoint not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        content_len = int(self.headers.get("Content-Length", 0))
        post_body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
        try:
            req_data = json.loads(post_body)
        except Exception:
            req_data = {}

        automator = NPTELAutomator()

        if path == "/api/cookies":
            raw_cookies = req_data.get("cookies", "")
            ok = option1_set_cookies(cookie_input_text=raw_cookies)
            self._send_json(200, {"success": ok})

        elif path == "/api/refresh-courses":
            courses = asyncio.run(automator.fetch_and_save_courses_json())
            self._send_json(200, {"success": True, "courses": courses})

        elif path == "/api/gemini-key":
            key = req_data.get("key", "").strip()
            if key:
                with open(".gemini_key", "w") as f:
                    f.write(key)
                self._send_json(200, {"success": True, "message": "Saved Gemini API key"})
            else:
                self._send_json(400, {"error": "Invalid API key"})

        elif path == "/api/solve":
            course_title = req_data.get("course_title", "")
            quiz_title = req_data.get("quiz_title", "")
            questions = req_data.get("questions", [])
            custom_key = req_data.get("gemini_key", "")
            api_key = get_gemini_api_key(custom_key)

            if not api_key:
                self._send_json(400, {"error": "No Gemini API key provided or saved."})
                return

            ok, solutions = solve_questions_with_gemini(api_key, course_title, quiz_title, questions)
            if ok:
                self._send_json(200, {"success": True, "solutions": solutions})
            else:
                self._send_json(500, {"success": False, "error": str(solutions)})

        elif path == "/api/submit":
            cid = req_data.get("course_id")
            uid = req_data.get("unit_id")
            aid = req_data.get("assessment_id")
            token = req_data.get("xsrf_token")
            questions = req_data.get("questions", [])
            selected_answers = req_data.get("selected_answers", {})

            ok, msg = asyncio.run(
                automator.submit_assessment_answers(cid, uid, aid, token, questions, selected_answers)
            )
            self._send_json(200, {"success": ok, "message": msg})

        elif path == "/api/extract-quizzes":
            cid = req_data.get("course_id")
            if cid:
                quizzes = asyncio.run(automator.extract_course_quizzes(cid))
                self._send_json(200, {"success": True, "quizzes": quizzes})
            else:
                # All courses
                courses = []
                if os.path.exists("courses.json"):
                    with open("courses.json") as f:
                        courses = json.load(f)
                all_q = []
                for c in courses:
                    q = asyncio.run(automator.extract_course_quizzes(c["id"]))
                    all_q.extend(q)
                self._send_json(200, {"success": True, "quizzes": all_q})

        elif path == "/api/complete-lessons":
            cid = req_data.get("course_id")
            max_units = int(req_data.get("max_units", 10))
            max_lessons = int(req_data.get("max_lessons", 20))
            if cid:
                asyncio.run(automator.complete_course_lessons(cid, max_units=max_units, max_lessons=max_lessons))
            else:
                courses = []
                if os.path.exists("courses.json"):
                    with open("courses.json") as f:
                        courses = json.load(f)
                for c in courses:
                    asyncio.run(automator.complete_course_lessons(c["id"], max_units=max_units, max_lessons=max_lessons))
            self._send_json(200, {"success": True, "message": "Lessons marked completed."})

        elif path == "/api/download-notes":
            cid = req_data.get("course_id")
            if cid:
                notes = asyncio.run(automator.fetch_and_download_course_notes(cid))
            else:
                courses = []
                if os.path.exists("courses.json"):
                    with open("courses.json") as f:
                        courses = json.load(f)
                notes = []
                for c in courses:
                    n = asyncio.run(automator.fetch_and_download_course_notes(c["id"]))
                    notes.extend(n)
            self._send_json(200, {"success": True, "notes": notes})

        else:
            self._send_json(404, {"error": "Endpoint not found"})


def run_server(port=8000):
    server = ThreadingHTTPServer(("0.0.0.0", port), NPTELApiHandler)
    print(f"🚀 NPTEL Automator API Server listening on http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Server stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-p", "--port", type=int, default=8000, help="Port to run server on")
    args = parser.parse_args()
    run_server(args.port)

"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  Play,
  Send,
  Key,
  RefreshCw,
  FileText,
  Layers,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Edit3,
  Bot,
  Zap,
} from "lucide-react";

// API Base URL pointing to Python backend bridge
const API_BASE = "http://localhost:8000/api";

interface Course {
  id: string;
  title: string;
  url: string;
  nc_code: string;
  start_date?: string;
  end_date?: string;
}

interface Choice {
  choice_id: string;
  index: number;
  text: string;
  score?: number;
}

interface Question {
  q_num: number;
  order: number;
  question_block_id: string;
  question_text: string;
  input_type: string;
  points: string;
  choices: Choice[];
  correct_choice_ids: string[];
  correct_choice_texts: string[];
  has_revealed_answer: boolean;
  student_is_answered: boolean;
}

interface Assignment {
  course_id: string;
  course_title?: string;
  unit_id: number | string;
  assessment_id: number | string;
  title: string;
  url: string;
  due_date: string | null;
  is_submitted: boolean;
  is_expired?: boolean;
  xsrf_token: string;
  total_questions: number;
  questions: Question[];
}

export default function NPTELDashboard() {
  const [activeTab, setActiveTab] = useState<"solver" | "courses" | "quizzes" | "notes">("solver");
  const [status, setStatus] = useState<{ cookies_loaded: boolean; courses_count: number; has_gemini_key: boolean } | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [reasonings, setReasonings] = useState<Record<number, string>>({});
  const [solveSources, setSolveSources] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [cookieInput, setCookieInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [solutionsMarkdown, setSolutionsMarkdown] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");

  useEffect(() => {
    fetchStatus();
    fetchCourses();
    fetchAssignments();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (res.ok) setStatus(await res.json());
    } catch {
      setActionMsg({ text: "Python API server is offline. Run 'python3 server.py' in root.", type: "error" });
    }
  };

  const fetchCourses = async () => {
    try {
      const res = await fetch(`${API_BASE}/courses`);
      if (res.ok) {
        const data = await res.json();
        setCourses(data.courses || []);
        if (data.courses?.length > 0 && !selectedCourseId) {
          setSelectedCourseId(data.courses[0].id);
        }
      }
    } catch { }
  };

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/assignments`);
      if (res.ok) {
        const data = await res.json();
        const list = data.unsubmitted?.length > 0 ? data.unsubmitted : (data.all || []);
        setAssignments(list);
        if (list.length > 0 && !selectedAssignment) {
          selectAssignmentToSolve(list[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const selectAssignmentToSolve = (a: Assignment) => {
    setSelectedAssignment(a);
    const initialAnswers: Record<number, string> = {};
    const initialSources: Record<number, string> = {};
    const initialReasons: Record<number, string> = {};

    a.questions?.forEach((q, idx) => {
      if (q.correct_choice_ids?.length > 0) {
        initialAnswers[idx] = q.correct_choice_ids[0];
        initialSources[idx] = "⭐ Verified Key";
        initialReasons[idx] = "Verified answer key extracted from NPTEL assessment.";
      }
    });

    setSelectedAnswers(initialAnswers);
    setSolveSources(initialSources);
    setReasonings(initialReasons);
  };

  const solveWithGemini = async () => {
    if (!selectedAssignment) return;
    setLoading(true);
    setActionMsg({ text: "🤖 Google Gemini AI is solving assignment questions...", type: "info" });

    try {
      const res = await fetch(`${API_BASE}/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_title: selectedAssignment.course_title || selectedAssignment.course_id,
          quiz_title: selectedAssignment.title,
          questions: selectedAssignment.questions,
          gemini_key: geminiKeyInput,
        }),
      });

      const data = await res.json();
      if (data.success && data.solutions) {
        const newAns = { ...selectedAnswers };
        const newSources = { ...solveSources };
        const newReasons = { ...reasonings };

        data.solutions.forEach((sol: any) => {
          const qIdx = selectedAssignment.questions.findIndex(
            (q) => q.q_num === sol.q_num || String(q.question_block_id) === String(sol.question_id)
          );
          if (qIdx !== -1) {
            const q = selectedAssignment.questions[qIdx];
            let cid = sol.selected_choice_id;
            if (!cid && sol.selected_choice_index !== undefined) {
              cid = q.choices[sol.selected_choice_index]?.choice_id;
            }
            newAns[qIdx] = String(cid);
            newSources[qIdx] = "🤖 Gemini AI";
            newReasons[qIdx] = sol.reasoning || "AI solved conceptual answer.";
          }
        });

        setSelectedAnswers(newAns);
        setSolveSources(newSources);
        setReasonings(newReasons);
        setActionMsg({ text: "✅ Gemini AI solved all questions! Review and click Submit.", type: "success" });
      } else {
        setActionMsg({ text: `❌ AI Error: ${data.error || "Solving failed"}`, type: "error" });
      }
    } catch (e: any) {
      setActionMsg({ text: `❌ Network error: ${e.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const submitAssignment = async () => {
    if (!selectedAssignment) return;
    setLoading(true);
    setActionMsg({ text: "🚀 Submitting answers to NPTEL via REST API...", type: "info" });

    try {
      const res = await fetch(`${API_BASE}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: selectedAssignment.course_id,
          unit_id: selectedAssignment.unit_id,
          assessment_id: selectedAssignment.assessment_id,
          xsrf_token: selectedAssignment.xsrf_token,
          questions: selectedAssignment.questions,
          selected_answers: selectedAnswers,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActionMsg({ text: data.message || "✅ Answers submitted successfully to NPTEL!", type: "success" });
        fetchAssignments();
      } else {
        setActionMsg({ text: data.message || "❌ Submission rejected by server.", type: "error" });
      }
    } catch (e: any) {
      setActionMsg({ text: `❌ Submission error: ${e.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const completeLessons = async (cid?: string) => {
    setLoading(true);
    setActionMsg({ text: `⚡ Marking course lessons completed via REST API...`, type: "info" });
    try {
      const res = await fetch(`${API_BASE}/complete-lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_id: cid }),
      });
      const data = await res.json();
      setActionMsg({ text: data.message || "✅ Course lessons marked completed!", type: "success" });
    } catch (e: any) {
      setActionMsg({ text: `❌ Error: ${e.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const extractQuizzes = async (cid?: string) => {
    setLoading(true);
    setActionMsg({ text: `📝 Extracting quizzes and generating study guides...`, type: "info" });
    try {
      const res = await fetch(`${API_BASE}/extract-quizzes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_id: cid }),
      });
      const data = await res.json();
      setActionMsg({ text: `✅ Extracted ${data.quizzes?.length || 0} quizzes & generated Markdown guides!`, type: "success" });
      if (cid) fetchSolutionsMarkdown(cid);
    } catch (e: any) {
      setActionMsg({ text: `❌ Error: ${e.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchSolutionsMarkdown = async (cid: string) => {
    try {
      const res = await fetch(`${API_BASE}/quizzes?course_id=${cid}`);
      if (res.ok) {
        const data = await res.json();
        setSolutionsMarkdown(data.solutions_markdown || "");
      }
    } catch { }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white flex items-center gap-2">
              NPTEL Automator <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">v2.0</span>
            </h1>
            <p className="text-xs text-slate-400">Next.js & Astryx UI • REST Automation & Gemini AI</p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs bg-slate-800/60 border border-slate-700/60 px-3 py-1.5 rounded-lg">
            <span className={`w-2 h-2 rounded-full ${status?.cookies_loaded ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
            <span className="text-slate-300">{status?.cookies_loaded ? "Cookies Active" : "No Cookies"}</span>
          </div>

          <div className="flex items-center space-x-2 text-xs bg-slate-800/60 border border-slate-700/60 px-3 py-1.5 rounded-lg">
            <Bot className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-300">{status?.has_gemini_key ? "Gemini Ready" : "No Gemini Key"}</span>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Credentials</span>
          </button>
        </div>
      </header>

      {/* Action Notification Banner */}
      {actionMsg && (
        <div className={`px-6 py-2.5 text-sm flex items-center justify-between ${actionMsg.type === "success" ? "bg-emerald-950/80 text-emerald-300 border-b border-emerald-800" :
            actionMsg.type === "error" ? "bg-rose-950/80 text-rose-300 border-b border-rose-800" :
              "bg-indigo-950/80 text-indigo-300 border-b border-indigo-800"
          }`}>
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="text-xs underline hover:opacity-80">Dismiss</button>
        </div>
      )}

      {/* Settings Modal/Drawer */}
      {showSettings && (
        <div className="bg-slate-900 border-b border-slate-800 p-6 grid md:grid-cols-2 gap-6 animate-in slide-in-from-top duration-200">
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-4 h-4 text-cyan-400" /> Swayam Session Cookies
            </label>
            <textarea
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
              placeholder="Paste cookie string: g_a=...; g_b=...; g_c=... or JSON"
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none"
            />
            <button
              onClick={async () => {
                const res = await fetch(`${API_BASE}/cookies`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ cookies: cookieInput }),
                });
                if (res.ok) {
                  setActionMsg({ text: "✅ Cookies saved successfully!", type: "success" });
                  fetchStatus();
                }
              }}
              className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg transition"
            >
              Save Cookies
            </button>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-indigo-400" /> Google Gemini API Key
            </label>
            <input
              type="password"
              value={geminiKeyInput}
              onChange={(e) => setGeminiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={async () => {
                const res = await fetch(`${API_BASE}/gemini-key`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ key: geminiKeyInput }),
                });
                if (res.ok) {
                  setActionMsg({ text: "✅ Gemini API key stored successfully!", type: "success" });
                  fetchStatus();
                }
              }}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition"
            >
              Save Gemini Key
            </button>
          </div>
        </div>
      )}

      {/* Main Navigation Tabs */}
      <div className="border-b border-slate-800 bg-slate-950/40 px-6 flex items-center justify-between">
        <div className="flex space-x-1">
          {[
            { id: "solver", label: "🤖 AI Quiz Solver & Submitter", icon: Sparkles },
            { id: "courses", label: "📚 Active Courses", icon: BookOpen },
            { id: "quizzes", label: "📝 Study Guide & Keys", icon: FileText },
            { id: "notes", label: "📑 Unit PDF Notes", icon: Download },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  if (tab.id === "quizzes" && selectedCourseId) fetchSolutionsMarkdown(selectedCourseId);
                }}
                className={`py-3 px-4 text-xs font-medium flex items-center gap-2 border-b-2 transition ${active
                    ? "border-cyan-400 text-cyan-400 bg-cyan-500/5"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            fetchStatus();
            fetchCourses();
            fetchAssignments();
          }}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 py-2 px-3 rounded hover:bg-slate-800 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* ============================================================ */}
        {/* TAB 1: AI QUIZ SOLVER & SUBMITTER */}
        {/* ============================================================ */}
        {activeTab === "solver" && (
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Left Column: Assignments List */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" /> Active Assignments
                </h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  {assignments.length} total
                </span>
              </div>

              <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
                {assignments.map((a, idx) => {
                  const isSelected = selectedAssignment?.assessment_id === a.assessment_id;
                  const isUnsubmitted = !a.is_submitted;

                  return (
                    <div
                      key={idx}
                      onClick={() => selectAssignmentToSolve(a)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition ${isSelected
                          ? "bg-cyan-950/40 border-cyan-500/60 shadow-lg shadow-cyan-500/10"
                          : "bg-slate-900/60 border-slate-800/80 hover:border-slate-700"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-200 line-clamp-1">{a.title}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${isUnsubmitted
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}
                        >
                          {isUnsubmitted ? "⏳ Open" : "🔄 Submitted"}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="truncate max-w-[150px]">{a.course_title || a.course_id}</span>
                        <span>{a.total_questions} Questions</span>
                      </div>

                      {a.due_date && (
                        <div className="mt-1 text-[10px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>Due: {new Date(a.due_date).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {assignments.length === 0 && !loading && (
                  <div className="p-8 text-center border border-slate-800/80 rounded-xl bg-slate-900/30">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-300 font-medium">No open assignments</p>
                    <p className="text-[11px] text-slate-500 mt-1">All course assignments are up to date.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Quiz Question Review & AI Solve Panel */}
            <div className="lg:col-span-8 space-y-4">
              {selectedAssignment ? (
                <>
                  {/* Top Action Bar */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        {selectedAssignment.title}
                        <a href={selectedAssignment.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-cyan-400">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Course: <span className="text-slate-300 font-medium">{selectedAssignment.course_title || selectedAssignment.course_id}</span> • Unit {selectedAssignment.unit_id}
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <button
                        onClick={solveWithGemini}
                        disabled={loading}
                        className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-indigo-500/20 flex items-center gap-2 transition disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Solve with Gemini AI</span>
                      </button>

                      <button
                        onClick={submitAssignment}
                        disabled={loading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-emerald-500/20 flex items-center gap-2 transition disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                        <span>Submit to NPTEL</span>
                      </button>
                    </div>
                  </div>

                  {/* Questions List */}
                  <div className="space-y-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                    {selectedAssignment.questions.map((q, qIdx) => {
                      const selId = String(selectedAnswers[qIdx] || "");
                      const reasoning = reasonings[qIdx];
                      const source = solveSources[qIdx];
                      const optionLetters = ["A", "B", "C", "D", "E", "F", "G", "H"];

                      return (
                        <div
                          key={q.question_block_id || qIdx}
                          className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-5 space-y-3.5 hover:border-slate-700 transition"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <span className="w-6 h-6 rounded-lg bg-slate-800 text-cyan-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                                {q.q_num}
                              </span>
                              <p className="text-sm text-slate-100 font-medium leading-relaxed">{q.question_text}</p>
                            </div>
                            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                              {q.points}
                            </span>
                          </div>

                          {/* Options Radio List */}
                          <div className="space-y-2 pt-1 pl-8">
                            {q.choices.map((c, cIdx) => {
                              const cid = String(c.choice_id ?? cIdx);
                              const isSelected = selId === cid || selId === String(cIdx);
                              const letter = optionLetters[cIdx] || `${cIdx + 1}`;

                              return (
                                <div
                                  key={c.choice_id || cIdx}
                                  onClick={() => {
                                    setSelectedAnswers({ ...selectedAnswers, [qIdx]: cid });
                                    setSolveSources({ ...solveSources, [qIdx]: "✏️ Manual Override" });
                                    setReasonings({ ...reasonings, [qIdx]: `Manually selected option (${letter})` });
                                  }}
                                  className={`p-3 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition ${isSelected
                                      ? "bg-cyan-950/40 border-cyan-500 text-cyan-200 font-medium"
                                      : "bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700"
                                    }`}
                                >
                                  <div className="flex items-center space-x-3">
                                    <span
                                      className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${isSelected ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-400"
                                        }`}
                                    >
                                      {letter}
                                    </span>
                                    <span>{c.text}</span>
                                  </div>

                                  {isSelected && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                      {source || "Selected"}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* AI Explanation / Reasoning Box */}
                          {reasoning && (
                            <div className="ml-8 p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/40 text-xs text-indigo-300 flex items-start gap-2">
                              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-indigo-200">Explanation: </span>
                                <span>{reasoning}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="p-12 text-center border border-slate-800 rounded-xl bg-slate-900/40">
                  <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-slate-300">Select an assignment to review & solve</h3>
                  <p className="text-xs text-slate-500 mt-1">Pick an assignment from the left list to inspect questions and trigger AI solving.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: ACTIVE COURSES */}
        {/* ============================================================ */}
        {activeTab === "courses" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Enrolled Active Courses</h2>
                <p className="text-xs text-slate-400">Manage parallel lesson progress, notes, and quizzes per course.</p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => completeLessons()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition"
                >
                  <Play className="w-3.5 h-3.5" /> Complete All Lessons
                </button>
                <button
                  onClick={() => extractQuizzes()}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition"
                >
                  <FileText className="w-3.5 h-3.5" /> Extract All Quizzes
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {courses.map((c) => (
                <div key={c.id} className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4 hover:border-slate-700 transition">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-cyan-400">
                      {c.nc_code || "NPTEL"}
                    </span>
                    <h3 className="text-sm font-bold text-white mt-2 line-clamp-2">{c.title}</h3>
                    <p className="text-xs font-mono text-slate-400 mt-1">{c.id}</p>
                  </div>

                  <div className="text-[11px] text-slate-500 space-y-1">
                    {c.start_date && <div>Start: {c.start_date}</div>}
                    {c.end_date && <div>End: {c.end_date}</div>}
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => completeLessons(c.id)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition"
                    >
                      <Play className="w-3 h-3 text-indigo-400" /> Complete
                    </button>
                    <button
                      onClick={() => {
                        extractQuizzes(c.id);
                        setSelectedCourseId(c.id);
                        setActiveTab("quizzes");
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition"
                    >
                      <FileText className="w-3 h-3 text-cyan-400" /> Study Guide
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: QUIZ STUDY GUIDE & MARKDOWN SOLUTIONS */}
        {/* ============================================================ */}
        {activeTab === "quizzes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Quiz Study Guides & Answer Keys</h2>
                <p className="text-xs text-slate-400">Auto-extracted verified answer keys and Markdown solution guides.</p>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={selectedCourseId}
                  onChange={(e) => {
                    setSelectedCourseId(e.target.value);
                    fetchSolutionsMarkdown(e.target.value);
                  }}
                  className="bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.id})
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => extractQuizzes(selectedCourseId)}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg transition"
                >
                  Regenerate
                </button>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
              {solutionsMarkdown ? (
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-[calc(100vh-280px)] overflow-y-auto">
                  {solutionsMarkdown}
                </pre>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-xs text-slate-400">No Markdown solution guide generated for this course yet.</p>
                  <button
                    onClick={() => extractQuizzes(selectedCourseId)}
                    className="mt-3 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg"
                  >
                    Extract Now
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: UNIT PDF NOTES */}
        {/* ============================================================ */}
        {activeTab === "notes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Unit-Wise PDF Lecture Notes</h2>
                <p className="text-xs text-slate-400">Lecture notes extracted and organized into unit folders.</p>
              </div>

              <button
                onClick={async () => {
                  setLoading(true);
                  setActionMsg({ text: "📑 Downloading all unit PDF notes in parallel...", type: "info" });
                  try {
                    await fetch(`${API_BASE}/download-notes`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({}),
                    });
                    setActionMsg({ text: "✅ All PDF notes downloaded successfully!", type: "success" });
                  } catch (e: any) {
                    setActionMsg({ text: `❌ Error: ${e.message}`, type: "error" });
                  } finally {
                    setLoading(false);
                  }
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition"
              >
                <Download className="w-3.5 h-3.5" /> Download All Notes
              </button>
            </div>

            <div className="p-8 border border-slate-800 rounded-xl bg-slate-900/40 text-center">
              <Download className="w-10 h-10 text-cyan-400 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-200">Local Download Directory</h3>
              {/* <p className="text-xs text-slate-400 mt-1 font-mono">{status?.output_dir || "./downloaded_notes"}</p> */}
              <p className="text-[11px] text-slate-500 mt-2">Notes are downloaded and organized unit-by-unit with index JSON files.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

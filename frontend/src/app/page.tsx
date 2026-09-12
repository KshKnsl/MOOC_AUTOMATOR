"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Bot,
  Zap,
  Folder,
  FolderOpen,
  File,
  FileSearch,
  HardDrive,
  ClipboardList,
} from "lucide-react";

const API_BASE = "http://localhost:8000/api";

interface Course {
  id: string; title: string; url: string; nc_code: string;
  start_date?: string; end_date?: string;
}
interface Choice { choice_id: string; index: number; text: string; score?: number; }
interface Question {
  q_num: number; order: number; question_block_id: string; question_text: string;
  input_type: string; points: string; choices: Choice[];
  correct_choice_ids: string[]; correct_choice_texts: string[];
  has_revealed_answer: boolean; student_is_answered: boolean;
}
interface Assignment {
  course_id: string; course_title?: string; unit_id: number | string;
  assessment_id: number | string; title: string; url: string;
  due_date: string | null; is_submitted: boolean; is_expired?: boolean;
  xsrf_token: string; total_questions: number; questions: Question[];
}
interface Quiz { course_id: string; unit_id: number; assessment_id: number; title: string; total_questions: number; }
interface FNode { type: "file" | "folder"; name: string; size?: number; path?: string; children?: FNode[]; }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}
function countFiles(nodes: FNode[]): number {
  return nodes.reduce((acc, n) => n.type === "file" ? acc + 1 : acc + countFiles(n.children || []), 0);
}

function TreeNode({ node, depth = 0 }: { node: FNode; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  const isPdf = node.name.toLowerCase().endsWith(".pdf");
  if (node.type === "folder") {
    const fc = countFiles(node.children || []);
    return (
      <div>
        <button onClick={() => setOpen(o => !o)} style={{ paddingLeft: `${depth * 16 + 8}px` }}
          className="w-full flex items-center gap-2 py-2 pr-3 rounded-lg hover:bg-slate-100 transition-colors duration-200 text-left group">
          {open ? <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />}
          {open ? <FolderOpen className="w-4.5 h-4.5 text-blue-500 shrink-0 drop-shadow-sm" /> : <Folder className="w-4.5 h-4.5 text-blue-500 shrink-0 drop-shadow-sm" />}
          <span className="text-sm font-medium text-slate-700 truncate flex-1 group-hover:text-blue-700 transition-colors">{node.name}</span>
          <span className="text-[10px] text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-full font-medium shrink-0">{fc} {fc === 1 ? "file" : "files"}</span>
        </button>
        {open && (
          <div className="mt-1 mb-2">
            {(node.children || []).map((child, i) => <TreeNode key={i} node={child} depth={depth + 1} />)}
            {(node.children || []).length === 0 && (
              <div style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }} className="py-2 text-xs text-slate-400 italic">Empty folder</div>
            )}
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{ paddingLeft: `${depth * 16 + 8}px` }}
      className="flex items-center gap-2.5 py-2 pr-3 rounded-lg hover:bg-white hover:shadow-sm transition-all duration-200 group cursor-pointer border border-transparent hover:border-slate-200">
      {isPdf ? <FileText className="w-4.5 h-4.5 text-rose-500 shrink-0 drop-shadow-sm" /> : <File className="w-4.5 h-4.5 text-slate-400 shrink-0 drop-shadow-sm" />}
      <span className="text-sm text-slate-600 truncate flex-1 group-hover:text-slate-900 transition-colors font-medium">{node.name}</span>
      {node.size !== undefined && <span className="text-[10px] text-slate-400 shrink-0 font-medium">{formatBytes(node.size)}</span>}
    </div>
  );
}

function FileManagerPanel({ courseId }: { courseId: string }) {
  const [tree, setTree] = useState<FNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [query, setQuery] = useState("");

  const fetchTree = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const res = await fetch(cid ? `${API_BASE}/files?course_id=${cid}` : `${API_BASE}/files`);
      if (res.ok) { const d = await res.json(); setTree(d.tree || []); setSearched(true); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (courseId) fetchTree(courseId); }, [courseId, fetchTree]);

  const flatFiles: FNode[] = [];
  function flatten(nodes: FNode[], prefix = "") {
    for (const n of nodes) {
      if (n.type === "file") flatFiles.push({ ...n, name: (prefix ? prefix + " › " : "") + n.name });
      else flatten(n.children || [], prefix ? prefix + " › " + n.name : n.name);
    }
  }
  flatten(tree);
  const filtered = query ? flatFiles.filter(f => f.name.toLowerCase().includes(query.toLowerCase())) : null;
  const totalFiles = countFiles(tree);

  return (
    <div className="flex flex-col h-full bg-slate-50/50 rounded-2xl border border-slate-200 overflow-hidden shadow-inner">
      <div className="flex items-center gap-3 p-4 bg-white border-b border-slate-200/80">
        <div className="relative flex-1 group">
          <FileSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search files…"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm" />
        </div>
        <button onClick={() => fetchTree(courseId)} disabled={loading}
          className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-500" : ""}`} /> Refresh
        </button>
      </div>

      {searched && !loading && (
        <div className="flex items-center gap-4 px-5 py-2.5 bg-slate-100/50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          <span className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5 text-indigo-500" />{totalFiles} PDF{totalFiles !== 1 ? "s" : ""}</span>
          <span className="flex items-center gap-1.5"><Folder className="w-3.5 h-3.5 text-blue-500" />{tree.filter(n => n.type === "folder").length} unit folders</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 min-h-0 bg-gradient-to-b from-transparent to-slate-50/80">
        {loading && <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm gap-3"><RefreshCw className="w-6 h-6 animate-spin text-blue-500" /> <span className="animate-pulse">Loading folder structure…</span></div>}
        {!loading && !searched && (
          <div className="flex flex-col items-center justify-center h-48 text-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm m-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-1">
              <FolderOpen className="w-6 h-6 text-blue-500" />
            </div>
            <p className="text-sm font-medium text-slate-700">Select a course</p>
            <p className="text-xs text-slate-500 max-w-[200px]">Choose a course from the dropdown above to browse its downloaded files.</p>
          </div>
        )}
        {!loading && searched && tree.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm m-4">
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mb-1">
              <Download className="w-6 h-6 text-rose-500" />
            </div>
            <p className="text-sm font-medium text-slate-700">No files found</p>
            <p className="text-xs text-slate-500 max-w-[250px]">Click &ldquo;Download Notes&rdquo; to fetch the PDF lecture notes for this course.</p>
          </div>
        )}
        {!loading && searched && (
          <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm">
            {query && filtered ? (
              <div className="space-y-1">
                {filtered.length === 0 && <div className="text-sm font-medium text-slate-500 text-center py-10">No results for &ldquo;<span className="text-slate-800">{query}</span>&rdquo;</div>}
                {filtered.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-blue-50/50 hover:shadow-sm border border-transparent hover:border-blue-100 transition-all cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-rose-500" />
                    </div>
                    <span className="text-sm font-medium text-slate-700 flex-1 truncate">{f.name}</span>
                    {f.size !== undefined && <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">{formatBytes(f.size)}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1 p-1">{tree.map((node, i) => <TreeNode key={i} node={node} depth={0} />)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QuizListPanel({ quizzes, selectedQuiz, onSelect }: { quizzes: Quiz[]; selectedQuiz: Quiz | null; onSelect: (q: Quiz) => void; }) {
  return (
    <div className="space-y-2">
      {quizzes.length === 0 && (
        <div className="p-8 text-center border border-slate-200 rounded-2xl bg-white shadow-sm flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <ClipboardList className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700">No quizzes extracted</p>
          <p className="text-xs text-slate-500 mt-1.5 max-w-[200px]">Click &ldquo;Regenerate&rdquo; to scan the course for assessments.</p>
        </div>
      )}
      {quizzes.map(q => {
        const active = selectedQuiz?.assessment_id === q.assessment_id;
        const tag = q.title.toLowerCase().startsWith("practice") ? "Practice" : q.title.toLowerCase().startsWith("quiz") ? "Graded" : "Quiz";
        const tagStyles = tag === "Practice" 
          ? "bg-purple-50 text-purple-600 border-purple-200"
          : tag === "Graded" 
            ? "bg-emerald-50 text-emerald-600 border-emerald-200"
            : "bg-blue-50 text-blue-600 border-blue-200";
            
        return (
          <button key={q.assessment_id} onClick={() => onSelect(q)}
            className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 relative overflow-hidden group ${
              active 
                ? "bg-white border-blue-400 shadow-md shadow-blue-500/10 ring-1 ring-blue-400 z-10" 
                : "bg-white/60 border-slate-200 hover:bg-white hover:border-blue-300 hover:shadow-sm"
            }`}>
            {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
            
            <div className="flex items-start justify-between gap-3">
              <span className={`text-sm font-bold line-clamp-2 flex-1 ${active ? "text-slate-900" : "text-slate-700 group-hover:text-slate-900"}`}>{q.title}</span>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-md border shrink-0 uppercase tracking-wider ${tagStyles}`}>{tag}</span>
            </div>
            
            <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
              <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md"><BookOpen className="w-3 h-3" /> Unit {q.unit_id}</span>
              <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md"><ClipboardList className="w-3 h-3" /> {q.total_questions} Qs</span>
            </div>
          </button>
        );
      })}
    </div>
  );
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
  const [quizList, setQuizList] = useState<Quiz[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [notesCourseId, setNotesCourseId] = useState("");

  useEffect(() => { fetchStatus(); fetchCourses(); fetchAssignments(); }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (res.ok) setStatus(await res.json());
    } catch { setActionMsg({ text: "Python API server is offline. Run 'python3 server.py' in root.", type: "error" }); }
  };

  const fetchCourses = async () => {
    try {
      const res = await fetch(`${API_BASE}/courses`);
      if (res.ok) {
        const data = await res.json();
        setCourses(data.courses || []);
        if (data.courses?.length > 0 && !selectedCourseId) {
          setSelectedCourseId(data.courses[0].id);
          setNotesCourseId(data.courses[0].id);
        }
      }
    } catch {}
  };

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/assignments`);
      if (res.ok) {
        const data = await res.json();
        const list = data.unsubmitted?.length > 0 ? data.unsubmitted : (data.all || []);
        setAssignments(list);
        if (list.length > 0 && !selectedAssignment) selectAssignmentToSolve(list[0]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const selectAssignmentToSolve = (a: Assignment) => {
    setSelectedAssignment(a);
    const ans: Record<number, string> = {}, src: Record<number, string> = {}, rsn: Record<number, string> = {};
    a.questions?.forEach((q, idx) => {
      if (q.correct_choice_ids?.length > 0) {
        ans[idx] = q.correct_choice_ids[0]; src[idx] = "⭐ Verified Key"; rsn[idx] = "Verified answer key extracted from NPTEL assessment.";
      }
    });
    setSelectedAnswers(ans); setSolveSources(src); setReasonings(rsn);
  };

  const solveWithGemini = async () => {
    if (!selectedAssignment) return;
    setLoading(true); setActionMsg({ text: "🤖 Google Gemini AI is solving assignment questions...", type: "info" });
    try {
      const res = await fetch(`${API_BASE}/solve`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_title: selectedAssignment.course_title || selectedAssignment.course_id, quiz_title: selectedAssignment.title, questions: selectedAssignment.questions, gemini_key: geminiKeyInput }) });
      const data = await res.json();
      if (data.success && data.solutions) {
        const na = { ...selectedAnswers }, ns = { ...solveSources }, nr = { ...reasonings };
        data.solutions.forEach((sol: any) => {
          const qi = selectedAssignment.questions.findIndex(q => q.q_num === sol.q_num || String(q.question_block_id) === String(sol.question_id));
          if (qi !== -1) {
            const q = selectedAssignment.questions[qi];
            let cid = sol.selected_choice_id;
            if (!cid && sol.selected_choice_index !== undefined) cid = q.choices[sol.selected_choice_index]?.choice_id;
            na[qi] = String(cid); ns[qi] = "🤖 Gemini AI"; nr[qi] = sol.reasoning || "AI solved conceptual answer.";
          }
        });
        setSelectedAnswers(na); setSolveSources(ns); setReasonings(nr);
        setActionMsg({ text: "✅ Gemini AI solved all questions! Review and click Submit.", type: "success" });
      } else { setActionMsg({ text: `❌ AI Error: ${data.error || "Solving failed"}`, type: "error" }); }
    } catch (e: any) { setActionMsg({ text: `❌ Network error: ${e.message}`, type: "error" }); }
    finally { setLoading(false); }
  };

  const submitAssignment = async () => {
    if (!selectedAssignment) return;
    setLoading(true); setActionMsg({ text: "🚀 Submitting answers to NPTEL via REST API...", type: "info" });
    try {
      const res = await fetch(`${API_BASE}/submit`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_id: selectedAssignment.course_id, unit_id: selectedAssignment.unit_id, assessment_id: selectedAssignment.assessment_id, xsrf_token: selectedAssignment.xsrf_token, questions: selectedAssignment.questions, selected_answers: selectedAnswers }) });
      const data = await res.json();
      if (data.success) { setActionMsg({ text: data.message || "✅ Answers submitted successfully to NPTEL!", type: "success" }); fetchAssignments(); }
      else { setActionMsg({ text: data.message || "❌ Submission rejected by server.", type: "error" }); }
    } catch (e: any) { setActionMsg({ text: `❌ Submission error: ${e.message}`, type: "error" }); }
    finally { setLoading(false); }
  };

  const completeLessons = async (cid?: string) => {
    setLoading(true); setActionMsg({ text: `⚡ Marking course lessons completed...`, type: "info" });
    try {
      const res = await fetch(`${API_BASE}/complete-lessons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course_id: cid }) });
      const data = await res.json(); setActionMsg({ text: data.message || "✅ Course lessons marked completed!", type: "success" });
    } catch (e: any) { setActionMsg({ text: `❌ Error: ${e.message}`, type: "error" }); }
    finally { setLoading(false); }
  };

  const extractQuizzes = async (cid?: string) => {
    setLoading(true); setActionMsg({ text: `📝 Extracting quizzes and generating study guides...`, type: "info" });
    try {
      const res = await fetch(`${API_BASE}/extract-quizzes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course_id: cid }) });
      const data = await res.json();
      setActionMsg({ text: `✅ Extracted ${data.quizzes?.length || 0} quizzes & generated Markdown guides!`, type: "success" });
      if (cid) fetchQuizData(cid);
    } catch (e: any) { setActionMsg({ text: `❌ Error: ${e.message}`, type: "error" }); }
    finally { setLoading(false); }
  };

  const fetchQuizData = async (cid: string) => {
    try {
      const res = await fetch(`${API_BASE}/quizzes?course_id=${cid}`);
      if (res.ok) {
        const data = await res.json();
        setSolutionsMarkdown(data.solutions_markdown || "");
        setQuizList(data.quizzes || []);
        if (data.quizzes?.length > 0) setSelectedQuiz(data.quizzes[0]);
      }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl sticky top-0 z-40 px-6 py-4 flex items-center justify-between border-b border-slate-200/80 shadow-sm">
        <div className="flex items-center space-x-3 group cursor-default">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 group-hover:rotate-3 transition-transform duration-300">
            <Zap className="w-5.5 h-5.5 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl text-slate-900 tracking-tight flex items-center gap-2.5">
              NPTEL Automator 
              <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wider">v2.0</span>
            </h1>
            <p className="text-[13px] font-medium text-slate-500">Next.js & Astryx UI • REST Automation & Gemini AI</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-xs font-semibold bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              {status?.cookies_loaded && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${status?.cookies_loaded ? "bg-emerald-500" : "bg-rose-500"}`}></span>
            </span>
            <span className={status?.cookies_loaded ? "text-slate-700" : "text-slate-500"}>{status?.cookies_loaded ? "Cookies Active" : "No Cookies"}</span>
          </div>
          <div className="flex items-center space-x-2 text-xs font-semibold bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl shadow-sm">
            <Bot className={`w-4 h-4 ${status?.has_gemini_key ? "text-indigo-500" : "text-slate-400"}`} />
            <span className={status?.has_gemini_key ? "text-slate-700" : "text-slate-500"}>{status?.has_gemini_key ? "Gemini Ready" : "No Gemini Key"}</span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="text-sm font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm active:scale-95 hover:shadow">
            <Key className="w-4 h-4 text-slate-500" /><span>Credentials</span>
          </button>
        </div>
      </header>

      {actionMsg && (
        <div className={`px-6 py-3.5 text-sm font-medium flex items-center justify-between shadow-sm backdrop-blur-sm z-30 relative ${
          actionMsg.type === "success" 
            ? "bg-emerald-50 text-emerald-800 border-b border-emerald-200" 
            : actionMsg.type === "error" 
              ? "bg-rose-50 text-rose-800 border-b border-rose-200" 
              : "bg-blue-50 text-blue-800 border-b border-blue-200"
        }`}>
          <div className="flex items-center gap-2">
            {actionMsg.type === "success" ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" /> : actionMsg.type === "error" ? <Zap className="w-4.5 h-4.5 text-rose-500" /> : <Bot className="w-4.5 h-4.5 text-blue-500" />}
            <span>{actionMsg.text}</span>
          </div>
          <button onClick={() => setActionMsg(null)} className="text-xs font-bold uppercase tracking-wider hover:opacity-70 transition-opacity bg-white/50 px-2 py-1 rounded-md border border-black/5">Dismiss</button>
        </div>
      )}

      {showSettings && (
        <div className="bg-white border-b border-slate-200 p-8 grid md:grid-cols-2 gap-8 shadow-sm relative z-20">
          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2"><Key className="w-4.5 h-4.5 text-blue-500" /> Swayam Session Cookies</label>
            <textarea value={cookieInput} onChange={e => setCookieInput(e.target.value)} placeholder="Paste cookie string: g_a=...; g_b=...; g_c=... or JSON" rows={3} 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-700 font-mono focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all outline-none shadow-inner resize-none" />
            <button onClick={async () => { const r = await fetch(`${API_BASE}/cookies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cookies: cookieInput }) }); if (r.ok) { setActionMsg({ text: "✅ Cookies saved!", type: "success" }); fetchStatus(); } }} 
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-all shadow-md active:scale-95">Save Cookies</button>
          </div>
          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2"><Bot className="w-4.5 h-4.5 text-indigo-500" /> Google Gemini API Key</label>
            <input type="password" value={geminiKeyInput} onChange={e => setGeminiKeyInput(e.target.value)} placeholder="AIzaSy..." 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-700 font-mono focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-none shadow-inner" />
            <button onClick={async () => { const r = await fetch(`${API_BASE}/gemini-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: geminiKeyInput }) }); if (r.ok) { setActionMsg({ text: "✅ Gemini API key stored!", type: "success" }); fetchStatus(); } }} 
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-indigo-500/20 active:scale-95">Save Gemini Key</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white/60 backdrop-blur-md px-6 pt-3 flex items-center justify-between sticky top-[77px] z-30 shadow-sm">
        <div className="flex space-x-2">
          {[
            { id: "solver", label: "AI Quiz Solver", icon: Sparkles },
            { id: "courses", label: "Active Courses", icon: BookOpen },
            { id: "quizzes", label: "Study Guides", icon: FileText },
            { id: "notes", label: "Unit PDF Notes", icon: Download },
          ].map(tab => {
            const Icon = tab.icon; const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); if (tab.id === "quizzes" && selectedCourseId) fetchQuizData(selectedCourseId); }}
                className={`pb-3 px-5 text-sm font-bold flex items-center gap-2.5 border-b-2 transition-all duration-300 relative ${
                  active 
                    ? "border-blue-600 text-blue-700" 
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}>
                {active && <div className="absolute inset-0 bg-blue-50/50 rounded-t-xl -z-10" />}
                <Icon className={`w-4.5 h-4.5 ${active ? "text-blue-600" : ""}`} />{tab.label}
              </button>
            );
          })}
        </div>
        <button onClick={() => { fetchStatus(); fetchCourses(); fetchAssignments(); }} className="text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center gap-2 pb-3 px-3 transition-colors group">
          <RefreshCw className={`w-4 h-4 group-hover:rotate-180 transition-transform duration-500 ${loading ? "animate-spin text-blue-500" : ""}`} /><span>Refresh Data</span>
        </button>
      </div>

      <main className="flex-1 p-6 max-w-[1400px] mx-auto w-full relative z-10">

        {/* ── TAB 1: AI QUIZ SOLVER ─────────────────────────────────────── */}
        {activeTab === "solver" && (
          <div className="grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center justify-between pb-1">
                <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2"><Clock className="w-5 h-5 text-blue-500" /> Active Assignments</h2>
                <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">{assignments.length} Total</span>
              </div>
              <div className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
                {assignments.map((a, idx) => {
                  const isSelected = selectedAssignment?.assessment_id === a.assessment_id;
                  const isUnsubmitted = !a.is_submitted;
                  return (
                    <div key={idx} onClick={() => selectAssignmentToSolve(a)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 relative overflow-hidden group ${
                        isSelected 
                          ? "bg-white border-blue-400 shadow-md shadow-blue-500/10 ring-1 ring-blue-400" 
                          : "bg-white border-slate-200 hover:border-blue-300 hover:shadow-md"
                      }`}>
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500" />}
                      <div className="flex items-start justify-between gap-3">
                        <span className={`text-sm font-bold line-clamp-2 ${isSelected ? "text-slate-900" : "text-slate-700 group-hover:text-slate-900"}`}>{a.title}</span>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md border shrink-0 uppercase tracking-wider ${
                          isUnsubmitted 
                            ? "bg-amber-50 text-amber-600 border-amber-200" 
                            : "bg-emerald-50 text-emerald-600 border-emerald-200"
                        }`}>
                          {isUnsubmitted ? "Open" : "Submitted"}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500 bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                        <span className="truncate max-w-[150px]">{a.course_title || a.course_id}</span>
                        <span className="flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5 text-slate-400" />{a.total_questions} Qs</span>
                      </div>
                      {a.due_date && <div className="mt-2.5 text-[11px] font-semibold text-rose-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /><span>Due: {new Date(a.due_date).toLocaleDateString()}</span></div>}
                    </div>
                  );
                })}
                {assignments.length === 0 && !loading && (
                  <div className="p-10 text-center border border-slate-200 rounded-3xl bg-white shadow-sm flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                    <p className="text-base font-bold text-slate-800">No open assignments</p>
                    <p className="text-sm text-slate-500 mt-1 max-w-[200px]">All course assignments are up to date. Great job!</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-8 space-y-6">
              {selectedAssignment ? (
                <>
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-wrap items-center justify-between gap-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent rounded-bl-full -z-10 opacity-60"></div>
                    <div>
                      <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-3">
                        {selectedAssignment.title}
                        <a href={selectedAssignment.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-500 bg-slate-50 p-1.5 rounded-lg border border-slate-200 transition-colors"><ExternalLink className="w-4 h-4" /></a>
                      </h2>
                      <div className="flex items-center gap-3 mt-2 text-sm font-medium text-slate-500">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md">{selectedAssignment.course_title || selectedAssignment.course_id}</span>
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Unit {selectedAssignment.unit_id}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button onClick={solveWithGemini} disabled={loading} 
                        className="px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none hover:shadow-xl hover:shadow-blue-500/20">
                        <Sparkles className="w-4.5 h-4.5" /><span>Solve with AI</span>
                      </button>
                      <button onClick={submitAssignment} disabled={loading} 
                        className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/30 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none">
                        <Send className="w-4.5 h-4.5" /><span>Submit</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6 max-h-[calc(100vh-270px)] overflow-y-auto pr-3 pb-8 custom-scrollbar">
                    {selectedAssignment.questions.map((q, qIdx) => {
                      const selId = String(selectedAnswers[qIdx] || "");
                      const reasoning = reasonings[qIdx]; const source = solveSources[qIdx];
                      const letters = ["A","B","C","D","E","F","G","H"];
                      return (
                        <div key={q.question_block_id || qIdx} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
                            <div className="flex items-start gap-4">
                              <span className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 font-extrabold text-sm flex items-center justify-center shrink-0 shadow-sm">{q.q_num}</span>
                              <p className="text-base text-slate-800 font-semibold leading-relaxed pt-1.5">{q.question_text}</p>
                            </div>
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 border border-slate-200 shrink-0 uppercase tracking-wider">{q.points}</span>
                          </div>
                          <div className="space-y-2.5 pl-13">
                            {q.choices.map((c, cIdx) => {
                              const cid = String(c.choice_id ?? cIdx);
                              const isSel = selId === cid || selId === String(cIdx);
                              const letter = letters[cIdx] || `${cIdx+1}`;
                              return (
                                <div key={c.choice_id || cIdx} onClick={() => { setSelectedAnswers({...selectedAnswers,[qIdx]:cid}); setSolveSources({...solveSources,[qIdx]:"✏️ Manual Override"}); setReasonings({...reasonings,[qIdx]:`Manually selected option (${letter})`}); }}
                                  className={`p-4 rounded-xl border-2 text-sm cursor-pointer flex items-center justify-between transition-all duration-200 group ${
                                    isSel 
                                      ? "bg-blue-50 border-blue-500 text-blue-900 shadow-sm" 
                                      : "bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-slate-50"
                                  }`}>
                                  <div className="flex items-center space-x-3.5">
                                    <span className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center transition-colors ${
                                      isSel 
                                        ? "bg-blue-500 text-white shadow-sm" 
                                        : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                                    }`}>{letter}</span>
                                    <span className={isSel ? "font-semibold" : "font-medium"}>{c.text}</span>
                                  </div>
                                  {isSel && <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-blue-100 text-blue-700 uppercase tracking-wider shadow-sm">{source || "Selected"}</span>}
                                </div>
                              );
                            })}
                          </div>
                          {reasoning && (
                            <div className="ml-13 mt-5 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 text-sm text-slate-700 flex items-start gap-3 shadow-inner">
                              <div className="bg-indigo-100 p-1.5 rounded-lg shrink-0">
                                <Sparkles className="w-4.5 h-4.5 text-indigo-600" />
                              </div>
                              <div className="pt-0.5"><span className="font-bold text-indigo-900">AI Reasoning: </span><span className="leading-relaxed">{reasoning}</span></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50">
                  <div className="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center mb-5 border border-slate-100">
                    <Bot className="w-10 h-10 text-slate-400" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-700">Select an assignment to start</h3>
                  <p className="text-sm text-slate-500 mt-2 max-w-[300px] leading-relaxed">Pick an assignment from the sidebar to inspect questions, trigger AI solving, and review answers.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 2: ACTIVE COURSES ─────────────────────────────────────── */}
        {activeTab === "courses" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-50 to-transparent rounded-bl-full -z-10 opacity-60"></div>
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">Enrolled Active Courses</h2>
                <p className="text-sm text-slate-500 mt-1 font-medium">Manage parallel lesson progress, notes, and study guides for your current semester.</p>
              </div>
              <div className="flex space-x-4">
                <button onClick={() => completeLessons()} className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl flex items-center gap-2.5 transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 active:scale-95"><Play className="w-4 h-4 fill-current" /> Complete All Lessons</button>
                <button onClick={() => extractQuizzes()} className="px-5 py-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-sm font-bold rounded-xl flex items-center gap-2.5 transition-all shadow-sm active:scale-95"><FileText className="w-4 h-4 text-blue-500" /> Extract All Quizzes</button>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {courses.map(c => (
                <div key={c.id} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 group flex flex-col h-full">
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 border border-slate-200">{c.nc_code || "NPTEL"}</span>
                    </div>
                    <h3 className="text-base font-extrabold text-slate-800 line-clamp-2 leading-tight group-hover:text-blue-700 transition-colors">{c.title}</h3>
                    <p className="text-xs font-mono font-medium text-slate-400 mt-2 bg-slate-50 inline-block px-2 py-1 rounded border border-slate-100">{c.id}</p>
                    
                    <div className="mt-5 space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {c.start_date && <div className="text-xs font-medium text-slate-600 flex justify-between"><span className="text-slate-400">Start:</span> <span>{new Date(c.start_date).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}</span></div>}
                      {c.end_date && <div className="text-xs font-medium text-slate-600 flex justify-between"><span className="text-slate-400">End:</span> <span>{new Date(c.end_date).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}</span></div>}
                    </div>
                  </div>
                  <div className="pt-5 border-t border-slate-100 grid grid-cols-2 gap-3 mt-auto shrink-0">
                    <button onClick={() => completeLessons(c.id)} className="px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors border border-indigo-100"><Play className="w-3.5 h-3.5 fill-current" /> Complete</button>
                    <button onClick={() => { setSelectedCourseId(c.id); extractQuizzes(c.id); setActiveTab("quizzes"); }} className="px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors border border-blue-100"><FileText className="w-3.5 h-3.5" /> Guide</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 3: QUIZ STUDY GUIDE ───────────────────────────────────── */}
        {activeTab === "quizzes" && (
          <div className="space-y-6 h-[calc(100vh-190px)] flex flex-col">
            <div className="flex items-center justify-between shrink-0 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Quiz Study Guides & Answer Keys</h2>
                <p className="text-sm text-slate-500 font-medium">Auto-extracted verified answer keys and beautifully formatted Markdown solution guides.</p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <BookOpen className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select value={selectedCourseId} onChange={e => { setSelectedCourseId(e.target.value); fetchQuizData(e.target.value); }} 
                    className="bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700 rounded-xl pl-9 pr-8 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 appearance-none shadow-sm cursor-pointer">
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title} ({c.id})</option>)}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <button onClick={() => extractQuizzes(selectedCourseId)} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-95 flex items-center gap-2"><RefreshCw className="w-4 h-4" />Regenerate</button>
              </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-6 flex-1 min-h-0">
              {/* Left: Quiz name list */}
              <div className="lg:col-span-4 flex flex-col min-h-0">
                <h3 className="text-sm font-extrabold text-slate-700 flex items-center gap-2 mb-3 shrink-0 uppercase tracking-wider pl-1">
                  <ClipboardList className="w-4 h-4 text-blue-500" /> Quizzes ({quizList.length})
                </h3>
                <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                  <QuizListPanel quizzes={quizList} selectedQuiz={selectedQuiz} onSelect={setSelectedQuiz} />
                </div>
              </div>

              {/* Right: Markdown viewer */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl flex flex-col min-h-0 shadow-sm overflow-hidden">
                {selectedQuiz && (
                  <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 shrink-0 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-extrabold text-slate-900">{selectedQuiz.title}</h3>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wide border border-blue-200">Unit {selectedQuiz.unit_id}</span>
                        <span className="text-[11px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-md uppercase tracking-wide border border-slate-300">{selectedQuiz.total_questions} questions</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-8 min-h-0 custom-scrollbar">
                  {solutionsMarkdown ? (
                    <article className="prose prose-slate prose-sm sm:prose-base max-w-none prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-a:text-blue-600 prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none font-medium text-slate-700">
                      {/* React Markdown or simple text formatting could go here. For now, preserving the pre tag structure but styling it nicely */}
                      <pre className="text-[13px] font-mono whitespace-pre-wrap leading-relaxed bg-slate-50 p-6 rounded-2xl border border-slate-100 overflow-x-auto text-slate-800 shadow-inner">{solutionsMarkdown}</pre>
                    </article>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                      <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mb-2 border-2 border-dashed border-slate-200">
                        <FileSearch className="w-10 h-10 text-slate-400" />
                      </div>
                      <p className="text-lg font-extrabold text-slate-700">No solution guide generated</p>
                      <p className="text-sm font-medium text-slate-500 max-w-[300px]">Extract quizzes for this course to generate a beautiful Markdown study guide here.</p>
                      <button onClick={() => extractQuizzes(selectedCourseId)} className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all">Extract Now</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: UNIT PDF NOTES — FILE MANAGER ─────────────────────── */}
        {activeTab === "notes" && (
          <div className="space-y-6 h-[calc(100vh-190px)] flex flex-col">
            <div className="flex items-center justify-between shrink-0 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-rose-50 to-transparent rounded-bl-full -z-10 opacity-60"></div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Unit-Wise PDF Lecture Notes</h2>
                <p className="text-sm font-medium text-slate-500">Browse and download categorized lecture notes directly from NPTEL & Google Drive.</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <BookOpen className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select value={notesCourseId} onChange={e => setNotesCourseId(e.target.value)} 
                    className="bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700 rounded-xl pl-9 pr-8 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 appearance-none shadow-sm cursor-pointer">
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title} ({c.id})</option>)}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <button onClick={async () => {
                  setLoading(true); setActionMsg({ text: "📑 Processing PDF notes request via terminal...", type: "info" });
                  // Notice: Server.py doesn't currently implement /download-notes endpoint with full CLI prompts. 
                  // It's recommended to run option 3 via terminal for the interactive prompts.
                  try {
                    const res = await fetch(`${API_BASE}/download-notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course_id: notesCourseId || undefined }) });
                    if(res.ok) setActionMsg({ text: "✅ PDF notes download process completed!", type: "success" });
                    else setActionMsg({ text: "⚠️ Check terminal. The server CLI prompt might require input.", type: "error" });
                  } catch (e: any) { setActionMsg({ text: `❌ Error: ${e.message}`, type: "error" }); }
                  finally { setLoading(false); }
                }} className="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-all shadow-md shadow-rose-500/20 active:scale-95">
                  <Download className="w-4 h-4" /> Fetch Missing Notes
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
              <FileManagerPanel courseId={notesCourseId} />
            </div>
          </div>
        )}

      </main>
      
      {/* Add some global styles for custom scrollbar */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
      `}} />
    </div>
  );
}

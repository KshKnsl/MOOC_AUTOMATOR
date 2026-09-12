import type { Assignment, CookieEntry, Course, FileNode } from "@/lib/types";

const KEYS = {
  cookiesRaw: "nptel.cookiesRaw",
  cookiesHeader: "nptel.cookiesHeader",
  geminiKey: "nptel.geminiKey",
  courses: "nptel.courses",
  quizzes: "nptel.quizzes",
  assignments: "nptel.assignments",
} as const;

function readString(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeString(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

function readJson<T>(key: string, fallback: T): T {
  const raw = readString(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function cookieHeaderFromRaw(rawInput: string): string {
  const input = rawInput.trim();
  if (!input) return "";
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      const pairs = parsed
        .filter((cookie: CookieEntry) => Boolean(cookie?.name && cookie?.value))
        .map((cookie: CookieEntry) => `${cookie.name}=${cookie.value}`);
      return [...new Set(pairs)].join("; ");
    }
  } catch {
    /* raw cookie string */
  }
  return input
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("="))
    .join("; ");
}

export function getCookiesRaw(): string {
  return readString(KEYS.cookiesRaw);
}

export function getCookieHeader(): string {
  return readString(KEYS.cookiesHeader);
}

export function saveCookiesLocal(rawInput: string): boolean {
  const header = cookieHeaderFromRaw(rawInput);
  if (!header) return false;
  writeString(KEYS.cookiesRaw, rawInput.trim());
  writeString(KEYS.cookiesHeader, header);
  return true;
}

export function getGeminiKeyLocal(): string {
  return readString(KEYS.geminiKey);
}

export function saveGeminiKeyLocal(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  writeString(KEYS.geminiKey, trimmed);
  return true;
}

export function getCoursesLocal(): Course[] {
  const courses = readJson<Course[]>(KEYS.courses, []);
  return Array.isArray(courses) ? courses : [];
}

export function saveCoursesLocal(courses: Course[]): void {
  writeString(KEYS.courses, JSON.stringify(courses));
}

export function getQuizzesLocal(courseId: string): { quizzes: Assignment[]; solutions_markdown: string } {
  const all = readJson<Record<string, { quizzes: Assignment[]; solutions_markdown: string }>>(KEYS.quizzes, {});
  return all[courseId] || { quizzes: [], solutions_markdown: "" };
}

export function saveQuizzesLocal(courseId: string, quizzes: Assignment[], solutionsMarkdown: string): void {
  const all = readJson<Record<string, { quizzes: Assignment[]; solutions_markdown: string }>>(KEYS.quizzes, {});
  all[courseId] = { quizzes, solutions_markdown: solutionsMarkdown };
  writeString(KEYS.quizzes, JSON.stringify(all));
}

export function getAssignmentsLocal(): { unsubmitted: Assignment[]; all: Assignment[] } {
  return readJson(KEYS.assignments, { unsubmitted: [], all: [] });
}

export function saveAssignmentsLocal(unsubmitted: Assignment[], all: Assignment[]): void {
  writeString(KEYS.assignments, JSON.stringify({ unsubmitted, all }));
}

export function localStatus() {
  return {
    cookies_loaded: Boolean(getCookieHeader()),
    courses_count: getCoursesLocal().length,
    has_gemini_key: Boolean(getGeminiKeyLocal()),
  };
}

const DB_NAME = "nptel-automator";
const STORE = "files";

export interface StoredPdf {
  path: string;
  courseId: string;
  name: string;
  size: number;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "path" });
        store.createIndex("courseId", "courseId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePdfLocal(file: StoredPdf): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(file);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getPdfLocal(path: string): Promise<StoredPdf | null> {
  const db = await openDb();
  const file = await new Promise<StoredPdf | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(path);
    request.onsuccess = () => resolve((request.result as StoredPdf) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return file;
}

export async function listPdfsLocal(courseId: string): Promise<StoredPdf[]> {
  const db = await openDb();
  const files = await new Promise<StoredPdf[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("courseId");
    const request = index.getAll(courseId);
    request.onsuccess = () => resolve((request.result as StoredPdf[]) || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function buildTreeFromPdfs(files: StoredPdf[]): FileNode[] {
  const root: FileNode[] = [];
  const folders = new Map<string, FileNode>();

  const ensureFolder = (segments: string[]): FileNode[] => {
    if (!segments.length) return root;
    const key = segments.join("/");
    const existing = folders.get(key);
    if (existing?.children) return existing.children;
    const parent = ensureFolder(segments.slice(0, -1));
    const folder: FileNode = { type: "folder", name: segments[segments.length - 1], children: [] };
    parent.push(folder);
    folders.set(key, folder);
    return folder.children as FileNode[];
  };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    const name = parts.pop() || file.name;
    const siblings = ensureFolder(parts);
    siblings.push({ type: "file", name, size: file.size, path: file.path });
  }
  return root;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export interface NotesDirectoryHandle {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<NotesDirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

export type DirectoryPickResult =
  | { kind: "unsupported" }
  | { kind: "cancelled" }
  | { kind: "picked"; handle: NotesDirectoryHandle };

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<NotesDirectoryHandle>;
};

export async function pickNotesDirectory(): Promise<DirectoryPickResult> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return { kind: "unsupported" };
  try {
    return { kind: "picked", handle: await picker({ mode: "readwrite" }) };
  } catch {
    return { kind: "cancelled" };
  }
}

export async function writeBlobToDirectory(
  root: NotesDirectoryHandle,
  relativePath: string,
  blob: Blob,
): Promise<void> {
  const parts = relativePath.split("/").filter(Boolean).map((part) => part.replace(/[\\/:*?"<>|]/g, "_"));
  const filename = parts.pop();
  if (!filename) return;
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part || "notes", { create: true });
  }
  const file = await dir.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
}

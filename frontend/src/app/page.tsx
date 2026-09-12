"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  BookOpen,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  KeyRound,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Selector } from "@astryxdesign/core/Selector";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { useToast } from "@astryxdesign/core/Toast";
import { TreeList } from "@astryxdesign/core/TreeList";
import type { TreeListItemData } from "@astryxdesign/core/TreeList";
import { apiFetch } from "@/lib/api";
import {
  buildTreeFromPdfs,
  downloadBlob,
  getAssignmentsLocal,
  getCookieHeader,
  getCookiesRaw,
  getCoursesLocal,
  getGeminiKeyLocal,
  getPdfLocal,
  getQuizzesLocal,
  listPdfsLocal,
  localStatus,
  pickNotesDirectory,
  saveAssignmentsLocal,
  saveCookiesLocal,
  saveCoursesLocal,
  saveGeminiKeyLocal,
  savePdfLocal,
  saveQuizzesLocal,
  writeBlobToDirectory,
} from "@/lib/client-store";
import type { Assignment, Course, FileNode } from "@/lib/types";

const API_BASE = "/api";

type TabId = "solver" | "courses" | "quizzes" | "notes";

interface GeminiSolution {
  q_num?: number;
  question_id?: string;
  selected_choice_id?: string;
  selected_choice_index?: number;
  reasoning?: string;
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function countFiles(nodes: FileNode[]): number {
  return nodes.reduce(
    (acc, n) => (n.type === "file" ? acc + 1 : acc + countFiles(n.children || [])),
    0,
  );
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function quizTag(title: string): { label: string; variant: "purple" | "success" | "neutral" } {
  const lower = title.toLowerCase();
  if (lower.startsWith("practice")) return { label: "Practice", variant: "purple" };
  if (lower.startsWith("quiz")) return { label: "Graded", variant: "success" };
  return { label: "Quiz", variant: "neutral" };
}

function sourceColor(source?: string): "blue" | "green" | "orange" | "gray" {
  if (source === "Gemini AI") return "blue";
  if (source === "Verified Key") return "green";
  if (source === "Manual Override") return "orange";
  return "gray";
}

function toTreeItems(
  nodes: FileNode[],
  onOpenFile: (file: FileNode) => void,
  selectedPath?: string,
  prefix = "",
): TreeListItemData[] {
  return nodes.map((node, index) => {
    const id = `${prefix}${node.name}-${index}`;
    if (node.type === "folder") {
      const files = countFiles(node.children || []);
      return {
        id,
        label: node.name,
        isExpanded: prefix === "",
        startContent: <Icon icon={FolderOpen} size="sm" />,
        endContent: (
          <Text type="body" size="sm" color="secondary">
            {files} {files === 1 ? "file" : "files"}
          </Text>
        ),
        children: toTreeItems(node.children || [], onOpenFile, selectedPath, `${id}/`),
      };
    }
    return {
      id,
      label: node.name,
      isSelected: Boolean(node.path && node.path === selectedPath),
      onClick: () => onOpenFile(node),
      startContent: <Icon icon={FileText} size="sm" />,
      endContent:
        node.size !== undefined ? (
          <Text type="body" size="sm" color="secondary">
            {formatBytes(node.size)}
          </Text>
        ) : undefined,
    };
  });
}

function flattenFiles(nodes: FileNode[], prefix = ""): FileNode[] {
  const files: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      files.push({ ...node, name: (prefix ? `${prefix} › ` : "") + node.name });
    } else {
      files.push(...flattenFiles(node.children || [], prefix ? `${prefix} › ${node.name}` : node.name));
    }
  }
  return files;
}

function FileManagerPanel({ courseId, refreshKey = 0 }: { courseId: string; refreshKey?: number }) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [query, setQuery] = useState("");
  const [previewFile, setPreviewFile] = useState<FileNode | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchTree = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      if (cid) {
        const pdfs = await listPdfsLocal(cid);
        setTree(buildTreeFromPdfs(pdfs));
      } else {
        setTree([]);
      }
      setSearched(true);
      setPreviewFile(null);
    } catch {
      setTree([]);
      setSearched(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (courseId) fetchTree(courseId);
  }, [courseId, fetchTree, refreshKey]);

  useEffect(() => {
    let revoked = false;
    let createdUrl: string | null = null;
    setPreviewUrl(null);
    if (!previewFile?.path) return;
    getPdfLocal(previewFile.path).then((stored) => {
      if (revoked || !stored) return;
      createdUrl = URL.createObjectURL(stored.blob);
      if (revoked) {
        URL.revokeObjectURL(createdUrl);
        return;
      }
      setPreviewUrl(createdUrl);
    });
    return () => {
      revoked = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [previewFile?.path]);

  const files = flattenFiles(tree);
  const filtered = query ? files.filter((file) => file.name.toLowerCase().includes(query.toLowerCase())) : null;
  const totalFiles = countFiles(tree);
  const folders = tree.filter((node) => node.type === "folder").length;

  const openFile = (file: FileNode) => {
    if (file.path && file.name.toLowerCase().endsWith(".pdf")) {
      setPreviewFile(file);
    }
  };

  const savePreviewToDevice = async () => {
    if (!previewFile?.path) return;
    const stored = await getPdfLocal(previewFile.path);
    if (stored) downloadBlob(stored.blob, stored.name);
  };

  return (
    <Card width="100%" height="100%" padding={0}>
      <Layout
        height="fill"
        padding={4}
        defaultHasDividers
        header={
          <LayoutHeader>
            <HStack gap={3} hAlign="between" vAlign="center">
              <TextInput
                label="Search files"
                isLabelHidden
                value={query}
                onChange={setQuery}
                placeholder="Search files..."
                startIcon={<Icon icon="search" />}
                hasClear={true}
                width="100%"
              />
              <Button
                label="Refresh"
                variant="secondary"
                size="sm"
                icon={<Icon icon={RefreshCw} />}
                isLoading={loading}
                onClick={() => fetchTree(courseId)}
              />
            </HStack>
          </LayoutHeader>
        }
        start={
          <LayoutPanel width={340} hasDivider padding={4}>
            <VStack gap={3}>
              {loading ? (
                <VStack gap={2}>
                  <Skeleton width="70%" height={16} />
                  <Skeleton width="90%" height={16} />
                  <Skeleton width="55%" height={16} />
                </VStack>
              ) : !searched ? (
                <EmptyState
                  isCompact
                  icon={<Icon icon={FolderOpen} size="lg" />}
                  title="Select a course"
                  description="Choose a course above to browse its downloaded lecture notes."
                />
              ) : tree.length === 0 ? (
                <EmptyState
                  isCompact
                  icon={<Icon icon={Download} size="lg" />}
                  title="No files yet"
                  description="Fetch PDF lecture notes for this course. They download to this device and stay available for preview here."
                />
              ) : query && filtered ? (
                filtered.length === 0 ? (
                  <EmptyState
                    isCompact
                    icon={<Icon icon="search" size="lg" />}
                    title="No matching files"
                    description={`Nothing matched "${query}".`}
                  />
                ) : (
                  <List density="compact">
                    {filtered.map((file, index) => (
                      <ListItem
                        key={`${file.name}-${index}`}
                        label={file.name}
                        isSelected={Boolean(file.path && file.path === previewFile?.path)}
                        onClick={() => openFile(file)}
                        startContent={<Icon icon={FileText} size="sm" />}
                        endContent={
                          file.size !== undefined ? (
                            <Text color="secondary">{formatBytes(file.size)}</Text>
                          ) : undefined
                        }
                      />
                    ))}
                  </List>
                )
              ) : (
                <VStack gap={3}>
                  <HStack gap={3}>
                    <Token label={`${totalFiles} PDFs`} icon={<Icon icon={FileText} size="sm" />} />
                    <Token label={`${folders} units`} icon={<Icon icon={FolderOpen} size="sm" />} />
                  </HStack>
                  <TreeList items={toTreeItems(tree, openFile, previewFile?.path)} density="compact" />
                </VStack>
              )}
            </VStack>
          </LayoutPanel>
        }
        content={
          <LayoutContent padding={0}>
            {previewFile && previewUrl ? (
              <Layout
                height="fill"
                padding={4}
                defaultHasDividers
                header={
                  <LayoutHeader>
                    <HStack gap={3} hAlign="between" vAlign="center">
                      <VStack gap={0.5}>
                        <Heading level={3} maxLines={1}>
                          {previewFile.name}
                        </Heading>
                        {previewFile.size !== undefined ? (
                          <Text color="secondary">{formatBytes(previewFile.size)}</Text>
                        ) : null}
                      </VStack>
                      <HStack gap={2}>
                        <IconButton
                          icon={<Icon icon={Download} />}
                          label="Save to this device"
                          variant="ghost"
                          onClick={savePreviewToDevice}
                        />
                        <IconButton
                          icon={<Icon icon={ExternalLink} />}
                          label="Open in new tab"
                          variant="ghost"
                          onClick={() => window.open(previewUrl, "_blank", "noreferrer")}
                        />
                      </HStack>
                    </HStack>
                  </LayoutHeader>
                }
                content={
                  <LayoutContent padding={0}>
                    <iframe
                      className="pdf-preview"
                      title={previewFile.name}
                      src={previewUrl}
                    />
                  </LayoutContent>
                }
              />
            ) : (
              <Center height="100%">
                <EmptyState
                  icon={<Icon icon={Eye} size="lg" />}
                  title="Preview a PDF"
                  description="Select a lecture note from the file tree to read it here."
                />
              </Center>
            )}
          </LayoutContent>
        }
      />
    </Card>
  );
}

export default function NPTELDashboard() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("solver");
  const [status, setStatus] = useState<{
    cookies_loaded: boolean;
    courses_count: number;
    has_gemini_key: boolean;
  } | null>(null);
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
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmCompleteAll, setConfirmCompleteAll] = useState(false);
  const [solutionsMarkdown, setSolutionsMarkdown] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [quizList, setQuizList] = useState<Assignment[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<Assignment | null>(null);
  const [notesCourseId, setNotesCourseId] = useState("");
  const [filesRefreshKey, setFilesRefreshKey] = useState(0);

  useEffect(() => {
    setCookieInput(getCookiesRaw());
    setGeminiKeyInput(getGeminiKeyLocal());
    setStatus(localStatus());
    const list = getCoursesLocal();
    setCourses(list);
    if (list.length > 0) {
      setSelectedCourseId(list[0].id);
      setNotesCourseId(list[0].id);
    }
    const cached = getAssignmentsLocal();
    const cachedList = cached.unsubmitted?.length ? cached.unsubmitted : cached.all || [];
    if (cachedList.length) {
      setAssignments(cachedList);
      selectAssignmentToSolve(cachedList[0]);
    }
    pingApi();
    if (getCookieHeader() && list.length) {
      fetchAssignments(list);
    }
  }, []);

  const pingApi = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (!res.ok) throw new Error("unavailable");
    } catch {
      setActionMsg({ text: "API is unavailable. Restart the app with pnpm dev.", type: "error" });
    }
  };

  const refreshLocalStatus = () => setStatus(localStatus());

  const fetchAssignments = async (courseList?: Course[]) => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/assignments`, {
        method: "POST",
        body: JSON.stringify({ courses: courseList || getCoursesLocal() }),
      });
      if (res.ok) {
        const data = await res.json();
        const list: Assignment[] = data.unsubmitted?.length > 0 ? data.unsubmitted : data.all || [];
        saveAssignmentsLocal(data.unsubmitted || [], data.all || []);
        setAssignments(list);
        if (list.length > 0 && !selectedAssignment) selectAssignmentToSolve(list[0]);
      } else {
        const data = await res.json().catch(() => ({}));
        setActionMsg({ text: data.error || "Could not scan assignments.", type: "error" });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const selectAssignmentToSolve = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    const answers: Record<number, string> = {};
    const sources: Record<number, string> = {};
    const reasons: Record<number, string> = {};
    assignment.questions?.forEach((question, index) => {
      if (question.correct_choice_ids?.length > 0) {
        answers[index] = question.correct_choice_ids[0];
        sources[index] = "Verified Key";
        reasons[index] = "Verified answer key extracted from NPTEL assessment.";
      }
    });
    setSelectedAnswers(answers);
    setSolveSources(sources);
    setReasonings(reasons);
  };

  const solveWithGemini = async () => {
    if (!selectedAssignment) return;
    setLoading(true);
    setActionMsg({ text: "Solving assignment questions with Gemini…", type: "info" });
    try {
      const res = await apiFetch(`${API_BASE}/solve`, {
        method: "POST",
        body: JSON.stringify({
          course_title: selectedAssignment.course_title || selectedAssignment.course_id,
          quiz_title: selectedAssignment.title,
          questions: selectedAssignment.questions,
          gemini_key: geminiKeyInput || getGeminiKeyLocal(),
        }),
      });
      const data = await res.json();
      if (data.success && data.solutions) {
        const nextAnswers = { ...selectedAnswers };
        const nextSources = { ...solveSources };
        const nextReasons = { ...reasonings };
        data.solutions.forEach((sol: GeminiSolution) => {
          const questionIndex = selectedAssignment.questions.findIndex(
            (question) => question.q_num === sol.q_num || String(question.question_block_id) === String(sol.question_id),
          );
          if (questionIndex !== -1) {
            const question = selectedAssignment.questions[questionIndex];
            let choiceId = sol.selected_choice_id;
            if (!choiceId && sol.selected_choice_index !== undefined) {
              choiceId = question.choices[sol.selected_choice_index]?.choice_id;
            }
            nextAnswers[questionIndex] = String(choiceId);
            nextSources[questionIndex] = "Gemini AI";
            nextReasons[questionIndex] = sol.reasoning || "AI solved conceptual answer.";
          }
        });
        setSelectedAnswers(nextAnswers);
        setSolveSources(nextSources);
        setReasonings(nextReasons);
        setActionMsg({ text: "Gemini solved the questions. Review the answers before submitting.", type: "success" });
        toast({ body: "Assignment solved. Review before submitting." });
      } else {
        setActionMsg({ text: `AI Error: ${data.error || "Solving failed"}`, type: "error" });
      }
    } catch (error) {
      setActionMsg({ text: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const submitAssignment = async () => {
    if (!selectedAssignment) return;
    setLoading(true);
    setConfirmSubmit(false);
    setActionMsg({ text: "Submitting answers to NPTEL…", type: "info" });
    try {
      const res = await apiFetch(`${API_BASE}/submit`, {
        method: "POST",
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
        setActionMsg({ text: data.message || "Answers submitted successfully to NPTEL.", type: "success" });
        toast({ body: "Assignment submitted." });
        fetchAssignments();
      } else {
        setActionMsg({ text: data.message || "Submission rejected by server.", type: "error" });
      }
    } catch (error) {
      setActionMsg({ text: `Submission error: ${error instanceof Error ? error.message : "Unknown error"}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const completeLessons = async (courseId?: string) => {
    setLoading(true);
    setConfirmCompleteAll(false);
    setActionMsg({ text: "Marking course lessons completed…", type: "info" });
    try {
      const ids = courseId ? [courseId] : getCoursesLocal().map((course) => course.id);
      for (const id of ids) {
        const res = await apiFetch(`${API_BASE}/complete-lessons`, {
          method: "POST",
          body: JSON.stringify({ course_id: id }),
        });
        const data = await res.json();
        if (!res.ok) {
          setActionMsg({ text: data.error || data.message || "Could not complete lessons.", type: "error" });
          return;
        }
      }
      setActionMsg({ text: "Course lessons marked completed.", type: "success" });
      toast({ body: "Lessons marked complete." });
    } catch (error) {
      setActionMsg({ text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchQuizData = async (courseId: string) => {
    const data = getQuizzesLocal(courseId);
    setSolutionsMarkdown(data.solutions_markdown || "");
    setQuizList(data.quizzes || []);
    if (data.quizzes?.length > 0) setSelectedQuiz(data.quizzes[0]);
    else setSelectedQuiz(null);
  };

  const extractQuizzes = async (courseId?: string) => {
    setLoading(true);
    setActionMsg({ text: "Extracting quizzes and generating study guides…", type: "info" });
    try {
      const ids = courseId ? [courseId] : getCoursesLocal().map((course) => course.id);
      let total = 0;
      for (const id of ids) {
        const res = await apiFetch(`${API_BASE}/extract-quizzes`, {
          method: "POST",
          body: JSON.stringify({ course_id: id }),
        });
        const data = await res.json();
        if (!res.ok) {
          setActionMsg({ text: data.error || "Could not extract quizzes.", type: "error" });
          return;
        }
        saveQuizzesLocal(id, data.quizzes || [], data.solutions_markdown || "");
        total += data.quizzes?.length || 0;
      }
      setActionMsg({ text: `Extracted ${total} quizzes and generated guides.`, type: "success" });
      fetchQuizData(courseId || selectedCourseId || ids[0] || "");
    } catch (error) {
      setActionMsg({ text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const downloadNotes = async () => {
    setLoading(true);
    setActionMsg({ text: "Choose a folder on this device, then notes will download there.", type: "info" });
    try {
      const pick = await pickNotesDirectory();
      const dir = pick.kind === "picked" ? pick.handle : null;
      const saveToDownloads = pick.kind === "unsupported";
      const ids = notesCourseId ? [notesCourseId] : getCoursesLocal().map((course) => course.id);
      let saved = 0;
      let failed = 0;
      for (const courseId of ids) {
        const res = await apiFetch(`${API_BASE}/download-notes`, {
          method: "POST",
          body: JSON.stringify({ course_id: courseId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setActionMsg({ text: data.error || "Could not find lecture notes.", type: "error" });
          return;
        }
        const items = Array.isArray(data.notes) ? data.notes : [];
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index] as {
            course_id: string;
            unit_title: string;
            filename: string;
            url: string;
            source: "drive" | "url";
            file_id?: string;
          };
          setActionMsg({
            text: `Saving ${saved + failed + 1} of ${items.length} notes to this device…`,
            type: "info",
          });
          const fileRes = await apiFetch(`${API_BASE}/fetch-note`, {
            method: "POST",
            body: JSON.stringify({ item }),
          });
          if (!fileRes.ok) {
            failed += 1;
            continue;
          }
          const blob = await fileRes.blob();
          const filename =
            decodeURIComponent(fileRes.headers.get("X-Filename") || "") || item.filename;
          const unit = String(item.unit_title || "notes").replace(/[\\/]/g, "_");
          const relativePath = `${item.course_id || courseId}/${unit}/${filename}`;
          await savePdfLocal({
            path: relativePath,
            courseId: item.course_id || courseId,
            name: filename,
            size: blob.size,
            blob,
          });
          if (dir) {
            await writeBlobToDirectory(dir, relativePath, blob);
          } else if (saveToDownloads) {
            downloadBlob(blob, filename);
          }
          saved += 1;
        }
      }
      setFilesRefreshKey((value) => value + 1);
      if (!saved && !failed) {
        setActionMsg({ text: "No lecture notes found for this course.", type: "info" });
      } else {
        const where =
          pick.kind === "picked"
            ? "the folder you chose"
            : pick.kind === "unsupported"
              ? "your Downloads folder"
              : "this browser (open a PDF and use Save to this device)";
        setActionMsg({
          text: failed
            ? `Saved ${saved} PDFs to ${where} (${failed} failed).`
            : `Saved ${saved} PDFs to ${where}.`,
          type: saved ? "success" : "error",
        });
      }
      toast({ body: saved ? `Saved ${saved} notes to this device.` : "No notes could be saved." });
    } catch (error) {
      setActionMsg({ text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const saveCookies = () => {
    if (saveCookiesLocal(cookieInput)) {
      setActionMsg({ text: "Cookies saved in this browser.", type: "success" });
      toast({ body: "Session cookies saved on this device." });
      refreshLocalStatus();
    } else {
      setActionMsg({ text: "Could not save cookies.", type: "error" });
    }
  };

  const refreshCourses = async () => {
    setLoading(true);
    setActionMsg({ text: "Refreshing enrolled courses from Swayam…", type: "info" });
    try {
      const res = await apiFetch(`${API_BASE}/refresh-courses`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const list: Course[] = data.courses || [];
        saveCoursesLocal(list);
        setCourses(list);
        if (list.length > 0) {
          setSelectedCourseId((current) => current || list[0].id);
          setNotesCourseId((current) => current || list[0].id);
        }
        setActionMsg({ text: `Loaded ${list.length} active courses.`, type: "success" });
        refreshLocalStatus();
      } else {
        setActionMsg({ text: data.error || "Could not refresh courses.", type: "error" });
      }
    } catch (error) {
      setActionMsg({ text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const saveGeminiKey = () => {
    if (saveGeminiKeyLocal(geminiKeyInput)) {
      setActionMsg({ text: "Gemini key saved in this browser.", type: "success" });
      toast({ body: "Gemini API key saved on this device." });
      refreshLocalStatus();
    } else {
      setActionMsg({ text: "Could not save Gemini key.", type: "error" });
    }
  };

  const openTab = (tab: TabId) => {
    setActiveTab(tab);
    if (tab === "quizzes" && selectedCourseId) fetchQuizData(selectedCourseId);
  };

  const answeredCount = useMemo(() => Object.keys(selectedAnswers).length, [selectedAnswers]);
  const questionCount = selectedAssignment?.questions?.length || 0;
  const courseOptions = courses.map((course) => ({ label: course.title, value: course.id }));

  const pageCopy: Record<TabId, { title: string; subtitle: string }> = {
    solver: { title: "Quiz Solver", subtitle: "Review answers, then submit to NPTEL." },
    courses: { title: "Active Courses", subtitle: "Complete lessons or extract quiz study guides." },
    quizzes: { title: "Study Guides", subtitle: "Browse extracted quizzes and markdown solutions." },
    notes: { title: "Lecture Notes", subtitle: "Save PDFs to this device and preview them here." },
  };

  return (
    <AppShell
      height="fill"
      variant="elevated"
      contentPadding={0}
      banner={
        actionMsg ? (
          <Banner
            status={actionMsg.type === "success" ? "success" : actionMsg.type === "error" ? "error" : "info"}
            title={actionMsg.text}
            isDismissable
            onDismiss={() => setActionMsg(null)}
          />
        ) : undefined
      }
      sideNav={
        <SideNav
          collapsible
          resizable={{ autoSaveId: "nptel-sidenav" }}
          header={
            <SideNavHeading
              icon={<NavIcon icon={<Icon icon={Zap} />} />}
              heading="NPTEL Automator"
              subheading="AI toolkit"
            />
          }
          footer={
            <VStack gap={2} padding={4}>
              <HStack gap={2} vAlign="center">
                <StatusDot
                  variant={status?.cookies_loaded ? "success" : "error"}
                  label={status?.cookies_loaded ? "Session connected" : "Session missing"}
                />
                <Text type="label" color="secondary">
                  {status?.cookies_loaded ? "Session ready" : "Add cookies"}
                </Text>
              </HStack>
              <HStack gap={2} vAlign="center">
                <StatusDot
                  variant={status?.has_gemini_key ? "success" : "warning"}
                  label={status?.has_gemini_key ? "Gemini ready" : "Gemini key missing"}
                />
                <Text type="label" color="secondary">
                  {status?.has_gemini_key ? "Gemini ready" : "Add API key"}
                </Text>
              </HStack>
            </VStack>
          }
          footerIcons={
            <IconButton
              icon={<Icon icon={KeyRound} />}
              label="Settings"
              variant="ghost"
              onClick={() => setShowSettings(true)}
            />
          }
        >
          <SideNavSection title="Workspace">
            <SideNavItem
              label="Quiz Solver"
              icon={Sparkles}
              isSelected={activeTab === "solver"}
              onClick={() => openTab("solver")}
              endContent={assignments.length > 0 ? <Badge label={String(assignments.length)} /> : undefined}
            />
            <SideNavItem
              label="Courses"
              icon={BookOpen}
              isSelected={activeTab === "courses"}
              onClick={() => openTab("courses")}
              endContent={courses.length > 0 ? <Badge label={String(courses.length)} /> : undefined}
            />
            <SideNavItem
              label="Study Guides"
              icon={FileText}
              isSelected={activeTab === "quizzes"}
              onClick={() => openTab("quizzes")}
            />
            <SideNavItem
              label="Files"
              icon={Download}
              isSelected={activeTab === "notes"}
              onClick={() => openTab("notes")}
            />
          </SideNavSection>
        </SideNav>
      }
    >
      {activeTab === "solver" && (
        <Layout
          height="fill"
          padding={4}
          defaultHasDividers
          header={
            <LayoutHeader>
              <HStack gap={3} hAlign="between" vAlign="center">
                <VStack gap={0.5}>
                  <Heading level={1}>{pageCopy.solver.title}</Heading>
                  <Text color="secondary">{pageCopy.solver.subtitle}</Text>
                </VStack>
                <Button
                  label="Refresh"
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon={RefreshCw} />}
                  isLoading={loading}
                  onClick={() => {
                    refreshLocalStatus();
                    fetchAssignments();
                  }}
                />
              </HStack>
            </LayoutHeader>
          }
          start={
            <LayoutPanel width={320} hasDivider padding={4}>
              <VStack gap={3}>
                <HStack gap={2} hAlign="between" vAlign="center">
                  <Text type="label" color="secondary">
                    Assignments
                  </Text>
                  <Badge label={String(assignments.length)} />
                </HStack>
                {loading && assignments.length === 0 ? (
                  <VStack gap={2}>
                    <Skeleton width="100%" height={56} />
                    <Skeleton width="100%" height={56} />
                    <Skeleton width="100%" height={56} />
                  </VStack>
                ) : assignments.length === 0 ? (
                  <EmptyState isCompact title="No open assignments" description="Refresh after loading cookies and courses." />
                ) : (
                  <List density="compact" hasDividers>
                    {assignments.map((assignment) => (
                      <ListItem
                        key={`${assignment.course_id}-${assignment.assessment_id}`}
                        label={assignment.title}
                        description={`${assignment.course_title || assignment.course_id} · ${assignment.total_questions} Qs${
                          assignment.due_date ? ` · Due ${formatDate(assignment.due_date)}` : ""
                        }`}
                        isSelected={selectedAssignment?.assessment_id === assignment.assessment_id}
                        onClick={() => selectAssignmentToSolve(assignment)}
                        endContent={
                          <Badge
                            label={assignment.is_submitted ? "Submitted" : "Open"}
                            variant={assignment.is_submitted ? "success" : "warning"}
                          />
                        }
                      />
                    ))}
                  </List>
                )}
              </VStack>
            </LayoutPanel>
          }
          content={
            <LayoutContent>
              {selectedAssignment ? (
                <VStack gap={4}>
                  <Card>
                    <VStack gap={3}>
                      <HStack gap={3} hAlign="between" vAlign="start">
                        <VStack gap={1}>
                          <HStack gap={2} vAlign="center">
                            <Heading level={2}>{selectedAssignment.title}</Heading>
                            <IconButton
                              icon={<Icon icon={ExternalLink} />}
                              label="Open on NPTEL"
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(selectedAssignment.url, "_blank", "noreferrer")}
                            />
                          </HStack>
                          <Text color="secondary">
                            {selectedAssignment.course_title || selectedAssignment.course_id} · Unit {selectedAssignment.unit_id}
                          </Text>
                        </VStack>
                        <HStack gap={2}>
                          <Button
                            label="Solve with AI"
                            variant="primary"
                            icon={<Icon icon={Bot} />}
                            isLoading={loading}
                            onClick={solveWithGemini}
                          />
                          <Button
                            label="Submit"
                            variant="secondary"
                            icon={<Icon icon={Send} />}
                            isDisabled={loading || answeredCount === 0}
                            onClick={() => setConfirmSubmit(true)}
                          />
                        </HStack>
                      </HStack>
                      <ProgressBar
                        label="Answers selected"
                        value={answeredCount}
                        max={Math.max(questionCount, 1)}
                        hasValueLabel
                        formatValueLabel={() => `${answeredCount} / ${questionCount}`}
                      />
                    </VStack>
                  </Card>

                  {selectedAssignment.questions.map((question, questionIndex) => {
                    const selectedId = String(selectedAnswers[questionIndex] || "");
                    const reasoning = reasonings[questionIndex];
                    const source = solveSources[questionIndex];
                    return (
                      <Card key={question.question_block_id || questionIndex}>
                        <VStack gap={3}>
                          <HStack gap={3} hAlign="between" vAlign="start">
                            <Heading level={3}>
                              {question.q_num}. {question.question_text}
                            </Heading>
                            <Badge label={question.points} />
                          </HStack>
                          <RadioList
                            label={`Question ${question.q_num} options`}
                            isLabelHidden
                            value={selectedId}
                            onChange={(value) => {
                              setSelectedAnswers({ ...selectedAnswers, [questionIndex]: value });
                              setSolveSources({ ...solveSources, [questionIndex]: "Manual Override" });
                              setReasonings({ ...reasonings, [questionIndex]: "Manually selected option." });
                            }}
                          >
                            {question.choices.map((choice, choiceIndex) => {
                              const choiceId = String(choice.choice_id ?? choiceIndex);
                              const letter = LETTERS[choiceIndex] || `${choiceIndex + 1}`;
                              const isSelected = selectedId === choiceId || selectedId === String(choiceIndex);
                              return (
                                <RadioListItem
                                  key={choice.choice_id || choiceIndex}
                                  value={choiceId}
                                  label={`${letter}) ${choice.text}`}
                                  endContent={
                                    isSelected ? (
                                      <Token label={source || "Selected"} color={sourceColor(source)} size="sm" />
                                    ) : undefined
                                  }
                                />
                              );
                            })}
                          </RadioList>
                          {reasoning ? (
                            <Card variant="muted">
                              <VStack gap={1}>
                                <Text type="label">Reasoning</Text>
                                <Text color="secondary">{reasoning}</Text>
                              </VStack>
                            </Card>
                          ) : null}
                        </VStack>
                      </Card>
                    );
                  })}
                </VStack>
              ) : (
                <Center height="100%">
                  <EmptyState
                    icon={<Icon icon={Sparkles} size="lg" />}
                    title="No assignment selected"
                    description="Choose an assignment from the list to review questions and submit answers."
                  />
                </Center>
              )}
            </LayoutContent>
          }
        />
      )}

      {activeTab === "courses" && (
        <Layout
          height="fill"
          padding={4}
          defaultHasDividers
          header={
            <LayoutHeader>
              <HStack gap={3} hAlign="between" vAlign="center">
                <VStack gap={0.5}>
                  <Heading level={1}>{pageCopy.courses.title}</Heading>
                  <Text color="secondary">{pageCopy.courses.subtitle}</Text>
                </VStack>
                <HStack gap={2}>
                  <Button
                    label="Complete all lessons"
                    variant="primary"
                    icon={<Icon icon={Play} />}
                    isLoading={loading}
                    onClick={() => setConfirmCompleteAll(true)}
                  />
                  <Button
                    label="Extract all quizzes"
                    variant="secondary"
                    icon={<Icon icon={FileText} />}
                    isLoading={loading}
                    onClick={() => extractQuizzes()}
                  />
                </HStack>
              </HStack>
            </LayoutHeader>
          }
          content={
            <LayoutContent>
              {courses.length === 0 ? (
                <Center height="100%">
                  <EmptyState
                    icon={<Icon icon={BookOpen} size="lg" />}
                    title="No active courses"
                    description="Add cookies in Settings, then refresh to pull enrolled NPTEL courses into this browser."
                    actions={<Button label="Open settings" onClick={() => setShowSettings(true)} />}
                  />
                </Center>
              ) : (
                <Grid columns={{ minWidth: 260, max: 4 }} gap={4} width="100%">
                  {courses.map((course) => (
                    <Card key={course.id} padding={4}>
                      <VStack gap={4}>
                        <VStack gap={2}>
                          <Badge label={course.nc_code || "NPTEL"} />
                          <Heading level={3} maxLines={2}>
                            {course.title}
                          </Heading>
                          <Text type="label" color="secondary">
                            {course.id}
                          </Text>
                        </VStack>
                        <VStack gap={1}>
                          {course.start_date ? (
                            <Text color="secondary">Starts {formatDate(course.start_date)}</Text>
                          ) : null}
                          {course.end_date ? (
                            <Text color="secondary">Ends {formatDate(course.end_date)}</Text>
                          ) : null}
                        </VStack>
                        <HStack gap={2}>
                          <Button
                            label="Complete"
                            variant="ghost"
                            size="sm"
                            icon={<Icon icon={Play} />}
                            onClick={() => completeLessons(course.id)}
                          />
                          <Button
                            label="Guide"
                            variant="ghost"
                            size="sm"
                            icon={<Icon icon={FileText} />}
                            onClick={() => {
                              setSelectedCourseId(course.id);
                              extractQuizzes(course.id);
                              openTab("quizzes");
                            }}
                          />
                        </HStack>
                      </VStack>
                    </Card>
                  ))}
                </Grid>
              )}
            </LayoutContent>
          }
        />
      )}

      {activeTab === "quizzes" && (
        <Layout
          height="fill"
          padding={4}
          defaultHasDividers
          header={
            <LayoutHeader>
              <HStack gap={3} hAlign="between" vAlign="center">
                <VStack gap={0.5}>
                  <Heading level={1}>{pageCopy.quizzes.title}</Heading>
                  <Text color="secondary">{pageCopy.quizzes.subtitle}</Text>
                </VStack>
                <HStack gap={2}>
                  <Selector
                    label="Course"
                    isLabelHidden
                    value={selectedCourseId}
                    onChange={(value) => {
                      const courseId = String(value);
                      setSelectedCourseId(courseId);
                      fetchQuizData(courseId);
                    }}
                    options={courseOptions}
                    placeholder="Select a course"
                    width={280}
                  />
                  <Button
                    label="Regenerate"
                    variant="primary"
                    icon={<Icon icon={RefreshCw} />}
                    isLoading={loading}
                    onClick={() => extractQuizzes(selectedCourseId)}
                  />
                </HStack>
              </HStack>
            </LayoutHeader>
          }
          start={
            <LayoutPanel width={300} hasDivider padding={4}>
              <VStack gap={3}>
                <Text type="label" color="secondary">
                  Quizzes ({quizList.length})
                </Text>
                {quizList.length === 0 ? (
                  <EmptyState
                    isCompact
                    title="No quizzes extracted"
                    description="Regenerate to scan this course for assessments."
                    actions={
                      <Button
                        label="Extract now"
                        size="sm"
                        variant="primary"
                        onClick={() => extractQuizzes(selectedCourseId)}
                      />
                    }
                  />
                ) : (
                  <List density="compact" hasDividers>
                    {quizList.map((quiz) => {
                      const tag = quizTag(quiz.title);
                      return (
                        <ListItem
                          key={quiz.assessment_id}
                          label={quiz.title}
                          description={`Unit ${quiz.unit_id} · ${quiz.total_questions} questions`}
                          isSelected={selectedQuiz?.assessment_id === quiz.assessment_id}
                          onClick={() => setSelectedQuiz(quiz)}
                          endContent={<Badge label={tag.label} variant={tag.variant} />}
                        />
                      );
                    })}
                  </List>
                )}
              </VStack>
            </LayoutPanel>
          }
          content={
            <LayoutContent>
              {solutionsMarkdown ? (
                <Card>
                  <VStack gap={3}>
                    {selectedQuiz ? (
                      <VStack gap={1}>
                        <Heading level={2}>{selectedQuiz.title}</Heading>
                        <Text color="secondary">
                          Unit {selectedQuiz.unit_id} · {selectedQuiz.total_questions} questions
                        </Text>
                      </VStack>
                    ) : null}
                    <Markdown>{solutionsMarkdown}</Markdown>
                  </VStack>
                </Card>
              ) : (
                <Center height="100%">
                  <EmptyState
                    icon={<Icon icon={FileText} size="lg" />}
                    title="No guide generated"
                    description="Extract quizzes for this course to build a readable study guide."
                    actions={
                      <Button
                        label="Extract now"
                        variant="primary"
                        onClick={() => extractQuizzes(selectedCourseId)}
                      />
                    }
                  />
                </Center>
              )}
            </LayoutContent>
          }
        />
      )}

      {activeTab === "notes" && (
        <Layout
          height="fill"
          padding={4}
          defaultHasDividers
          header={
            <LayoutHeader>
              <HStack gap={3} hAlign="between" vAlign="center">
                <VStack gap={0.5}>
                  <Heading level={1}>{pageCopy.notes.title}</Heading>
                  <Text color="secondary">{pageCopy.notes.subtitle}</Text>
                </VStack>
                <HStack gap={2}>
                  <Selector
                    label="Course"
                    isLabelHidden
                    value={notesCourseId}
                    onChange={(value) => setNotesCourseId(String(value))}
                    options={courseOptions}
                    placeholder="Select a course"
                    width={280}
                  />
                  <Button
                    label="Fetch notes"
                    variant="primary"
                    icon={<Icon icon={Download} />}
                    isLoading={loading}
                    onClick={downloadNotes}
                  />
                </HStack>
              </HStack>
            </LayoutHeader>
          }
          content={
            <LayoutContent padding={0}>
              <FileManagerPanel courseId={notesCourseId} refreshKey={filesRefreshKey} />
            </LayoutContent>
          }
        />
      )}

      <Dialog isOpen={showSettings} onOpenChange={setShowSettings} purpose="form" width={560}>
        <Layout
          padding={4}
          defaultHasDividers
          header={
            <DialogHeader
              title="Connection settings"
              subtitle="Cookies and Gemini key stay in this browser. Nothing is stored on the server."
              onOpenChange={setShowSettings}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={4}>
                <TextArea
                  label="Swayam session cookies"
                  description="Paste g_a, g_b, and g_c or a JSON cookie array. Saved only in this browser."
                  value={cookieInput}
                  onChange={setCookieInput}
                  placeholder="g_a=…; g_b=…; g_c=…"
                  rows={4}
                />
                <TextInput
                  label="Google Gemini API key"
                  description="Saved only in this browser."
                  type="password"
                  value={geminiKeyInput}
                  onChange={setGeminiKeyInput}
                  placeholder="AIzaSy…"
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Refresh courses" variant="ghost" isLoading={loading} onClick={refreshCourses} />
                <Button label="Save cookies" variant="secondary" onClick={saveCookies} />
                <Button label="Save key" variant="primary" onClick={saveGeminiKey} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <AlertDialog
        isOpen={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Submit this assignment?"
        description="Selected answers will be sent to NPTEL using your current session. Review everything before confirming."
        actionLabel="Submit answers"
        actionVariant="primary"
        isActionLoading={loading}
        onAction={submitAssignment}
      />

      <AlertDialog
        isOpen={confirmCompleteAll}
        onOpenChange={setConfirmCompleteAll}
        title="Mark every course complete?"
        description="This marks lessons complete across all active courses. You can still run this on a single course from its card."
        actionLabel="Complete all lessons"
        isActionLoading={loading}
        onAction={() => completeLessons()}
      />
    </AppShell>
  );
}

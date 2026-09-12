import { extractDriveFolderFileIds, fetchDriveFile } from "@/lib/drive";
import { httpGet, httpPost } from "@/lib/http";
import {
  cleanTextString,
  courseIdFromUrl,
  parseJsonPayload,
  sanitizeFilename,
  stripXssi,
} from "@/lib/text";
import type { Assignment, Course, NoteFetchItem, Question } from "@/lib/types";

function parseApiJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(stripXssi(text)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function fetchEnrolledCourses(cookie: string): Promise<Course[]> {
  const enrolled: Course[] = [];
  const { ok, text } = await httpGet("https://swayam.gov.in/rest/courses_enrolled", cookie, {
    accept: "text/plain, */*; q=0.01",
    referer: "https://swayam.gov.in/mycourses",
  });
  if (!ok || !text) return enrolled;

  let apiData: unknown = {};
  try {
    apiData = JSON.parse(stripXssi(text));
  } catch {
    apiData = {};
  }

  const record = apiData as Record<string, unknown>;
  let payload: unknown = record.payload ?? {};
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }

  const now = Date.now();
  let allItems: unknown[] = [];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    allItems = ((payload as Record<string, unknown>).ongoing_courses as unknown[]) || [];
  } else if (Array.isArray(apiData)) {
    allItems = apiData;
  }

  for (const item of allItems) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.closed === true) continue;
    const endDateStr = String(row.end_date || "");
    if (endDateStr) {
      const end = Date.parse(endDateStr.replace("Z", "+00:00"));
      if (!Number.isNaN(end) && end < now) continue;
    }

    const title = String(row.title || "Unknown Course");
    const searchStr = [row.federated_login_url, row.slug, row.course_admin_email, row.courseCode, row.id]
      .map((value) => String(value || ""))
      .join(" ");
    const match = searchStr.match(/noc\d+_[a-z0-9]+/i);
    const courseId = (match ? match[0].toLowerCase() : String(row.id || title)).toLowerCase();
    if (courseId && !enrolled.some((course) => course.id === courseId)) {
      enrolled.push({
        id: String(courseId),
        title,
        url: `https://onlinecourses.nptel.ac.in/${courseId}`,
        nc_code: String(row.nc_code || "NPTEL"),
        start_date: String(row.start_date || ""),
        end_date: String(row.end_date || ""),
      });
    }
  }

  return enrolled;
}

export async function fetchAssessmentDetails(
  cookie: string,
  courseId: string,
  unitId: unknown,
  assessmentId: unknown,
): Promise<Assignment | null> {
  const cId = courseIdFromUrl(String(courseId));
  const apiUrl = `https://onlinecourses.nptel.ac.in/e-learning/api/assessment?course_id=${cId}&unit_id=${unitId}&assessment_id=${assessmentId}`;
  const quizWebUrl = `https://onlinecourses.nptel.ac.in/e-learning/course/${cId}?unitId=${unitId}&assessmentId=${assessmentId}`;
  const { ok, text } = await httpGet(apiUrl, cookie);
  if (!ok || !text) return null;

  let adata: Record<string, unknown>;
  try {
    adata = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }

  const htmlDoc = String(adata.html || "");
  const embedded: Record<string, Record<string, unknown>> = {};
  for (const match of htmlDoc.matchAll(/window\.atob\(["'](.*?)["']\)/g)) {
    try {
      const decoded = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
      if (decoded && typeof decoded === "object") {
        if ("quid" in decoded) {
          embedded[String(decoded.quid)] = decoded as Record<string, unknown>;
        } else {
          for (const value of Object.values(decoded as Record<string, unknown>)) {
            if (value && typeof value === "object" && "question" in (value as Record<string, unknown>)) {
              const row = value as Record<string, unknown>;
              embedded[String(row.question)] = row;
            }
          }
        }
      }
    } catch {
      /* ignore blob */
    }
  }

  const assessmentData = (adata.assessment_data || {}) as Record<string, unknown>;
  const rawQuestions = (assessmentData.visible_questions || []) as Array<Record<string, unknown>>;
  const parsedQuestions: Question[] = [];

  rawQuestions.forEach((question, idx) => {
    const qId = String(question.question_block_id || "");
    const groupId = String(question.question_group_block_id || "");
    const instId = String(question.instance_id || "gKGUpDkZvzSf");
    const qText = cleanTextString(question.question_text);
    const qType = String(question.input_type || "radio");
    const multipleSel = Boolean(question.multiple_selections);
    const points = Number(question.points ?? 1);
    const choices: Question["choices"] = [];
    const correctIds: string[] = [];
    const correctTexts: string[] = [];

    const rawChoices = (question.choices || []) as Array<Record<string, unknown>>;
    rawChoices.forEach((choice, cIdx) => {
      const cid = String(choice.choice_id ?? cIdx);
      const ctext = cleanTextString(choice.text);
      const cscore = Number(choice.score ?? 0);
      if (cscore >= 1 || cscore > 0) {
        correctIds.push(cid);
        correctTexts.push(ctext);
      }
      choices.push({ choice_id: cid, index: cIdx, text: ctext, score: cscore });
    });

    if (!correctIds.length && embedded[qId]) {
      const embChoices = (embedded[qId].choices || []) as Array<Record<string, unknown>>;
      embChoices.forEach((choice, cIdx) => {
        const score = Number(choice.score ?? 0);
        if (score >= 1 || score > 0) {
          const cid = String(cIdx);
          const ctext = cleanTextString(choice.text);
          if (!correctIds.includes(cid)) correctIds.push(cid);
          if (!correctTexts.includes(ctext)) correctTexts.push(ctext);
          if (choices[cIdx]) choices[cIdx].score = score || 1;
        }
      });
    }

    parsedQuestions.push({
      q_num: idx + 1,
      order: idx,
      question_block_id: qId,
      question_group_block_id: groupId,
      instance_id: instId,
      question_text: qText,
      input_type: qType,
      multiple_selections: multipleSel,
      points: points === 1 ? "1 Point" : `${points} Points`,
      choices,
      correct_choice_ids: correctIds,
      correct_choice_texts: correctTexts,
      has_revealed_answer: correctIds.length > 0,
      student_is_answered: Boolean(question.student_is_answered),
      student_score: question.student_score,
      student_response_flags: question.student_response_flags,
      student_response_text: String(question.student_response_text || ""),
    });
  });

  return {
    course_id: cId,
    unit_id: unitId as number | string,
    assessment_id: assessmentId as number | string,
    title: String(adata.assessment_title || `Assignment (Unit ${unitId})`),
    url: quizWebUrl,
    due_date: (adata.due_date as string) || null,
    is_submitted: Boolean(adata.is_submitted || adata.submission_date),
    submission_date: adata.submission_date as string | undefined,
    xsrf_token: String(adata.assessment_xsrf_token || ""),
    total_questions: parsedQuestions.length,
    questions: parsedQuestions,
  };
}

export function generateSolutionsMarkdown(courseId: string, quizzes: Assignment[]): string {
  const lines = [
    `# 📚 ${courseId.toUpperCase()} — Assignment Solutions & Quiz Study Guide`,
    `*Generated automatically on ${new Date().toISOString().replace("T", " ").slice(0, 19)}*`,
    "",
    "---",
    "",
  ];
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];

  quizzes.forEach((quiz, qIdx) => {
    const title = quiz.title || `Assignment ${qIdx + 1}`;
    lines.push(`## 📝 ${title}`);
    lines.push(`- **Web URL**: [${title}](${quiz.url})`);
    lines.push(`- **Due Date**: \`${quiz.due_date || "N/A"}\``);
    lines.push(`- **Status**: ${quiz.is_submitted ? "✅ Submitted" : "⏳ Not Submitted"}`);
    lines.push(`- **Total Questions**: ${quiz.total_questions}`);
    lines.push("");

    for (const question of quiz.questions) {
      lines.push(`### Q${question.q_num}. ${question.question_text}`);
      lines.push(`*${question.points}*`);
      lines.push("");
      const correctIds = question.correct_choice_ids || [];
      question.choices.forEach((choice, cIdx) => {
        const letter = letters[cIdx] || String(cIdx + 1);
        const isCorrect = correctIds.includes(String(choice.choice_id)) || Number(choice.score || 0) > 0;
        lines.push(`- **(${letter})** ${choice.text}${isCorrect ? " [✓] (Correct Answer)" : ""}`);
      });
      if (correctIds.length) {
        const answer = (question.correct_choice_texts || correctIds).join(", ");
        lines.push("");
        lines.push(`> **Verified Correct Answer**: \`${answer}\``);
      }
      lines.push("");
    }
    lines.push("---", "");
  });

  return lines.join("\n");
}

export async function extractCourseQuizzes(
  cookie: string,
  courseId: string,
): Promise<{ quizzes: Assignment[]; solutions_markdown: string }> {
  const cId = courseIdFromUrl(courseId);
  const { ok, text } = await httpGet(
    `https://onlinecourses.nptel.ac.in/e-learning/api/courseoutline?course_id=${cId}`,
    cookie,
  );
  if (!ok) return { quizzes: [], solutions_markdown: "" };
  const data = parseApiJson(text);
  const payload = parseJsonPayload(data.payload);
  const assessments = (payload.assessments || []) as Array<Record<string, unknown>>;
  const extracted: Assignment[] = [];
  for (const item of assessments) {
    if (!item || typeof item !== "object") continue;
    const title = String(item.title || "Assignment");
    try {
      const details = await fetchAssessmentDetails(cookie, cId, item.id, item.unit_id);
      if (details?.questions?.length) {
        details.title = title;
        extracted.push(details);
      }
    } catch {
      /* skip quiz */
    }
  }
  return { quizzes: extracted, solutions_markdown: generateSolutionsMarkdown(cId, extracted) };
}

export async function scanAssignments(
  cookie: string,
  courses: Course[],
  targetCourse?: string | null,
): Promise<{ unsubmitted: Assignment[]; all: Assignment[] }> {
  let list = courses;
  if (targetCourse) {
    list = list.filter((course) => course.id === targetCourse || course.id.includes(targetCourse));
  }

  const courseResults = await Promise.all(
    list.map(async (course) => {
      const { ok, text } = await httpGet(
        `https://onlinecourses.nptel.ac.in/e-learning/api/courseoutline?course_id=${course.id}`,
        cookie,
      );
      if (!ok) return [] as Assignment[];
      try {
        const data = parseApiJson(text);
        const payload = parseJsonPayload(data.payload);
        const assessments = (payload.assessments || []) as Array<Record<string, unknown>>;
        const results = await Promise.all(
          assessments.map(async (item) => {
            if (!item || typeof item !== "object") return null;
            const details = await fetchAssessmentDetails(cookie, course.id, item.id, item.unit_id);
            if (details?.questions?.length) {
              details.course_title = course.title;
              details.title = String(item.title || "Assignment");
              return details;
            }
            return null;
          }),
        );
        return results.filter((item): item is Assignment => Boolean(item));
      } catch {
        return [] as Assignment[];
      }
    }),
  );

  const all: Assignment[] = [];
  const unsubmitted: Assignment[] = [];
  const now = Date.now();
  for (const courseList of courseResults) {
    for (const assignment of courseList) {
      let expired = false;
      if (assignment.due_date) {
        const due = Date.parse(String(assignment.due_date).replace("Z", "+00:00"));
        if (!Number.isNaN(due) && due < now) expired = true;
      }
      assignment.is_expired = expired;
      all.push(assignment);
      if (!assignment.is_submitted && !expired) unsubmitted.push(assignment);
    }
  }
  return { unsubmitted, all };
}

export async function submitAssessmentAnswers(
  cookie: string,
  courseId: string,
  unitId: unknown,
  assessmentId: unknown,
  xsrfToken: string,
  questions: Question[],
  selectedAnswers: Record<string, string>,
): Promise<{ success: boolean; message: string }> {
  const cId = courseIdFromUrl(String(courseId));
  const submitUrl = `https://onlinecourses.nptel.ac.in/e-learning/api/assessment?course_id=${cId}&unit_id=${unitId}&assessment_id=${assessmentId}`;
  const answersDict: Record<string, unknown> = {
    version: "1.5",
    individualScores: {},
    containedTypes: {},
    answers: {},
    quids: {},
    rawScore: 0,
    totalWeight: 0,
    percentScore: 0,
    save_draft: false,
    is_submitted: true,
  };

  const instanceGroups: Record<string, Record<string, unknown>> = {};
  questions.forEach((question, idx) => {
    const instId = question.instance_id || "gKGUpDkZvzSf";
    const qBlockId = question.question_block_id || "";
    const qKey = `${instId}.${idx}.${qBlockId}`;
    const sel = selectedAnswers[idx] ?? selectedAnswers[String(idx)];
    const choices = question.choices || [];
    const qType = question.input_type || "radio";

    let lObj: Record<string, unknown>;
    if (qType === "radio" || qType === "checkbox" || choices.length) {
      const respFlags = choices.map((choice) => {
        const cid = String(choice.choice_id);
        const cIdx = choice.index;
        return String(sel) === cid || String(sel) === String(cIdx);
      });
      lObj = { responses: respFlags, is_answered: respFlags.some(Boolean) };
    } else {
      const respStr = String(sel || "");
      lObj = { response: respStr, is_answered: Boolean(respStr.trim()) };
    }

    if (!instanceGroups[instId]) instanceGroups[instId] = { is_answered: false };
    instanceGroups[instId][qKey] = lObj;
    if (lObj.is_answered) instanceGroups[instId].is_answered = true;
  });

  for (const [instId, value] of Object.entries(instanceGroups)) {
    answersDict[instId] = value;
  }

  const { ok, text } = await httpPost(submitUrl, { answers: answersDict, xsrf_token: xsrfToken }, cookie);
  const clean = stripXssi(text);
  try {
    const resObj = JSON.parse(clean) as Record<string, unknown>;
    const status = resObj.status;
    if (status === 200 || status === "200" || status === "success" || status === "ok" || (ok && !resObj.error)) {
      return { success: true, message: "Your answers are successfully submitted to NPTEL!" };
    }
    const msg = String(resObj.message || resObj.error || clean);
    return { success: false, message: `Submission rejected by server: ${msg}` };
  } catch {
    if (ok) return { success: true, message: "Submission request completed successfully!" };
    return { success: false, message: `Server returned: ${clean.slice(0, 200)}` };
  }
}

export async function completeCourseLessons(cookie: string, courseId: string): Promise<void> {
  const cId = courseIdFromUrl(courseId);
  const { ok, text } = await httpGet(
    `https://onlinecourses.nptel.ac.in/e-learning/api/courseoutline?course_id=${cId}`,
    cookie,
  );
  if (!ok) return;
  const data = parseApiJson(text);
  const payload = parseJsonPayload(data.payload);
  const lessons = (payload.lessons || {}) as Record<string, Record<string, unknown>>;
  for (const lesson of Object.values(lessons)) {
    await httpGet(
      `https://onlinecourses.nptel.ac.in/e-learning/api/lesson?course_id=${cId}&unit_id=${lesson.unit_id}&lesson_id=${lesson.lesson_id}`,
      cookie,
    );
  }
}

export async function discoverCourseNotes(cookie: string, courseId: string): Promise<NoteFetchItem[]> {
  const cId = courseIdFromUrl(courseId);
  const { ok, text } = await httpGet(
    `https://onlinecourses.nptel.ac.in/e-learning/api/courseoutline?course_id=${cId}`,
    cookie,
  );
  if (!ok) return [];
  const data = parseApiJson(text);
  const payload = parseJsonPayload(data.payload);
  const units = (payload.units || {}) as Record<string, Record<string, unknown>>;
  const lessons = (payload.lessons || {}) as Record<string, Record<string, unknown>>;
  const discovered: NoteFetchItem[] = [];
  const seen = new Set<string>();

  for (const lesson of Object.values(lessons)) {
    const uid = lesson.unit_id;
    const lid = lesson.lesson_id;
    const ltitle = String(lesson.title || "");
    const unitObj = units[`_${uid}`] || units[String(uid)] || {};
    const unitTitle = String(unitObj.title || `Unit_${uid}`);
    const lessonRes = await httpGet(
      `https://onlinecourses.nptel.ac.in/e-learning/api/lesson?course_id=${cId}&unit_id=${uid}&lesson_id=${lid}`,
      cookie,
    );
    if (!lessonRes.ok) continue;
    const links = lessonRes.text.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
    for (const raw of links) {
      const cleanUrl = raw.replace(/[;,."]+$/, "");
      const lower = cleanUrl.toLowerCase();
      const isNote =
        lower.includes("drive.google.com") ||
        lower.endsWith(".pdf") ||
        lower.includes("pdf") ||
        lower.includes("lecture_notes");
      const unwanted = [".jpg", ".png", ".jpeg", ".gif", ".svg", "forms/d/", "_next", "gtm", "css", "accessibility", "logo"].some(
        (token) => lower.includes(token),
      );
      if (!isNote || unwanted || seen.has(cleanUrl)) continue;
      seen.add(cleanUrl);

      if (cleanUrl.includes("drive.google.com/file/d/")) {
        const match = cleanUrl.match(/\/file\/d\/([^/?]+)/);
        if (!match) continue;
        discovered.push({
          course_id: cId,
          unit_id: uid,
          unit_title: unitTitle,
          lesson_title: ltitle,
          filename: `${sanitizeFilename(ltitle)}.pdf`,
          source: "drive",
          file_id: match[1],
          url: cleanUrl,
        });
      } else if (cleanUrl.includes("drive.google.com/drive/folders/")) {
        const ids = await extractDriveFolderFileIds(cleanUrl);
        ids.forEach((fileId, idx) => {
          discovered.push({
            course_id: cId,
            unit_id: uid,
            unit_title: unitTitle,
            lesson_title: ltitle,
            filename: `${sanitizeFilename(ltitle)}_part${idx + 1}.pdf`,
            source: "drive",
            file_id: fileId,
            url: cleanUrl,
          });
        });
      } else if (lower.endsWith(".pdf")) {
        const urlName = decodeURIComponent(cleanUrl.replace(/\/+$/, "").split("/").pop()?.split("?")[0] || "");
        const filename = urlName.toLowerCase().endsWith(".pdf")
          ? sanitizeFilename(urlName)
          : `${sanitizeFilename(ltitle)}.pdf`;
        discovered.push({
          course_id: cId,
          unit_id: uid,
          unit_title: unitTitle,
          lesson_title: ltitle,
          filename,
          source: "url",
          url: cleanUrl,
        });
      }
    }
  }

  return discovered;
}

export async function fetchNoteFile(
  cookie: string,
  item: NoteFetchItem,
): Promise<{ filename: string; bytes: Buffer } | null> {
  if (item.source === "drive" && item.file_id) {
    return fetchDriveFile(item.file_id, item.filename.replace(/\.pdf$/i, ""));
  }
  const result = await httpGet(item.url, cookie);
  if (!result.ok || result.bytes.length < 100) return null;
  return { filename: item.filename, bytes: result.bytes };
}

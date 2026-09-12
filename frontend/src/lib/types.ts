export interface CookieEntry {
  name: string;
  value: string;
  url?: string;
}

export interface Course {
  id: string;
  title: string;
  url: string;
  nc_code?: string;
  start_date?: string;
  end_date?: string;
}

export interface Choice {
  choice_id: string;
  index: number;
  text: string;
  score?: number;
}

export interface Question {
  q_num: number;
  order: number;
  question_block_id: string;
  question_group_block_id?: string;
  instance_id?: string;
  question_text: string;
  input_type: string;
  multiple_selections?: boolean;
  points: string;
  choices: Choice[];
  correct_choice_ids: string[];
  correct_choice_texts: string[];
  has_revealed_answer: boolean;
  student_is_answered: boolean;
  student_score?: unknown;
  student_response_flags?: unknown;
  student_response_text?: string;
}

export interface Assignment {
  course_id: string;
  course_title?: string;
  unit_id: number | string;
  assessment_id: number | string;
  title: string;
  url: string;
  due_date: string | null;
  is_submitted: boolean;
  is_expired?: boolean;
  submission_date?: string;
  xsrf_token: string;
  total_questions: number;
  questions: Question[];
}

export interface FileNode {
  type: "file" | "folder";
  name: string;
  size?: number;
  path?: string;
  children?: FileNode[];
}

export interface NoteFetchItem {
  course_id: string;
  unit_id: unknown;
  unit_title: string;
  lesson_title: string;
  filename: string;
  source: "drive" | "url";
  file_id?: string;
  url: string;
}

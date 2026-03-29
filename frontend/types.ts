export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  reasoning?: string;
  chartData?: {
    type: 'trend_chart';
    title: string;
    data: any[];
  };
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  is_favorite?: boolean;
}

export enum ModelType {
  STANDARD = 'gemini-2.5-flash',
  FINETUNED = 'gemini-3-pro-preview',
  BACKEND = 'backend-model'
}

export type FunctionMode = 'wenzhi' | 'shuzhi' | null;

export interface UserProfile {
  name: string;
  avatarUrl: string;
  role: string;
}

// New Types for Knowledge Base
export interface KnowledgeBase {
  id: string;
  title: string;
  description: string;
  coverColor: string; // CSS gradient string for the cover
  fileCount: number;
  is_system?: boolean;
}

export interface KBFile {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadDate: string;
  content?: string; // Mock content
}

// Table Query Types
export interface TableQueryParams {
  tableName: string;
  accountNum?: string;
  orgNum?: string;
  subjNum?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface TableRow {
  id: string;
  acct_num: string;
  acg_dt: string;
  ccy: string;
  dt: string;
  gnl_ldgr_bal: string;
  org_num: string;
  sbact_acct_bal: string;
  sbj_num: string;
}

export interface Employee {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  location: string;
  joinDate: string;
  bio: string;
  avatarUrl: string;
  security_level: string;
}

export enum ViewMode {
  VIEW = 'VIEW',
  EDIT = 'EDIT'
}

export interface Post {
  id: number | string;
  author: string;
  avatarColor: string;
  date: string;
  tag: string;
  tagColor: string;
  title: string;
  content: string;
  likes: number;
  comments: number;
  favorites: number;
}
/**
 * Collaboration Types
 * Defines types for real-time collaborative editing
 */

export interface CollabUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  color: string;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  status: 'viewing' | 'editing' | 'idle';
  lastActive: number;
}

export interface CursorPosition {
  line: number;
  column: number;
  offset: number;
}

export interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
}

export interface CollabSession {
  id: string;
  articleSlug: string;
  users: Map<string, CollabUser>;
  createdAt: number;
  updatedAt: number;
}

export interface CollabMessage {
  type: 'join' | 'leave' | 'cursor' | 'selection' | 'edit' | 'sync' | 'presence';
  userId: string;
  articleSlug: string;
  data: any;
  timestamp: number;
}

export interface CollabState {
  connected: boolean;
  sessionId: string | null;
  users: CollabUser[];
  localUser: CollabUser | null;
}

export interface EditOperation {
  type: 'insert' | 'delete' | 'retain';
  position: number;
  content?: string;
  length?: number;
  userId: string;
  timestamp: number;
}

export interface CollaborationConfig {
  articleSlug: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  wsUrl?: string;
}

// Color palette for user cursors
export const USER_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Purple
  '#85C1E9', // Light Blue
];

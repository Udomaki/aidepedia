/**
 * Collaboration Module
 * Exports for real-time collaborative editing
 */

export * from './types';
export { CollaborationManager, getCollaborationManager, closeCollaborationManager } from './collaboration-manager';
export { OfflineManager, NetworkManager } from './offline-manager';
export { parseMentions, extractUniqueUsernames, MentionSuggest } from './mentions';

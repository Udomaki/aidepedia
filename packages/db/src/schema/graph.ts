import { pgTable, serial, varchar, text, integer, timestamp, boolean, index, jsonb, doublePrecision } from 'drizzle-orm/pg-core';
import { articles } from './index';
import { users } from './index';

// Graph node types
export type NodeType = 'article' | 'category' | 'tag' | 'user';

// Graph edge types
export type EdgeType = 'references' | 'related_to' | 'authored_by' | 'tagged_with' | 'categorized_as' | 'co_occurrence';

// Graph nodes table - stores all nodes in the knowledge graph
export const graph_nodes = pgTable('graph_nodes', {
  id: serial('id').primaryKey(),
  nodeType: varchar('node_type', { 
    enum: ['article', 'category', 'tag', 'user'],
    length: 20
  }).notNull(),
  entityId: integer('entity_id').notNull(), // ID of the actual entity (article, user, etc.)
  label: varchar('label', { length: 500 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  
  // Graph metrics (pre-calculated for performance)
  centralityScore: doublePrecision('centrality_score').default(0),
  communityId: integer('community_id'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  nodeTypeIdx: index('graph_node_type_idx').on(table.nodeType),
  entityIdIdx: index('graph_node_entity_idx').on(table.entityId),
  nodeTypeEntityIdx: index('graph_node_type_entity_idx').on(table.nodeType, table.entityId),
  centralityIdx: index('graph_node_centrality_idx').on(table.centralityScore),
  communityIdx: index('graph_node_community_idx').on(table.communityId),
}));

// Graph edges table - stores relationships between nodes
export const graph_edges = pgTable('graph_edges', {
  id: serial('id').primaryKey(),
  sourceNodeId: integer('source_node_id').notNull().references(() => graph_nodes.id, { onDelete: 'cascade' }),
  targetNodeId: integer('target_node_id').notNull().references(() => graph_nodes.id, { onDelete: 'cascade' }),
  
  edgeType: varchar('edge_type', { 
    enum: ['references', 'related_to', 'authored_by', 'tagged_with', 'categorized_as', 'co_occurrence'],
    length: 20
  }).notNull(),
  
  strength: doublePrecision('strength').default(1.0), // Relationship strength (0-1)
  weight: integer('weight').default(1), // Weight for analytics
  
  isManual: boolean('is_manual').default(false), // User-created or auto-detected
  verifiedAt: timestamp('verified_at'), // When the relationship was verified
  verifiedBy: integer('verified_by').references(() => users.id, { onDelete: 'set null' }),
  
  metadata: jsonb('metadata').$type<{
    source?: string; // Where the relationship was detected (content, tag, etc.)
    context?: string; // Context around the relationship
    confidence?: number; // Detection confidence
  }>(),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  sourceIdx: index('graph_edge_source_idx').on(table.sourceNodeId),
  targetIdx: index('graph_edge_target_idx').on(table.targetNodeId),
  edgeTypeIdx: index('graph_edge_type_idx').on(table.edgeType),
  sourceTargetIdx: index('graph_edge_source_target_idx').on(table.sourceNodeId, table.targetNodeId),
  strengthIdx: index('graph_edge_strength_idx').on(table.strength),
}));

// Graph communities - detected clusters of related nodes
export const graph_communities = pgTable('graph_communities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  nodeCount: integer('node_count').default(0),
  edgeCount: integer('edge_count').default(0),
  
  // Community metadata
  dominantCategory: varchar('dominant_category', { length: 100 }),
  dominantTags: text('dominant_tags').array().default([]),
  avgCentrality: doublePrecision('avg_centrality').default(0),
  
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Graph analytics snapshots - periodic analytics calculations
export const graph_analytics = pgTable('graph_analytics', {
  id: serial('id').primaryKey(),
  snapshotDate: timestamp('snapshot_date').notNull(),
  
  // Graph statistics
  totalNodes: integer('total_nodes').notNull().default(0),
  totalEdges: integer('total_edges').notNull().default(0),
  totalCommunities: integer('total_communities').default(0),
  
  // Node type breakdown
  articleNodes: integer('article_nodes').default(0),
  categoryNodes: integer('category_nodes').default(0),
  tagNodes: integer('tag_nodes').default(0),
  userNodes: integer('user_nodes').default(0),
  
  // Edge type breakdown
  referenceEdges: integer('reference_edges').default(0),
  relatedEdges: integer('related_edges').default(0),
  authoredEdges: integer('authored_edges').default(0),
  taggedEdges: integer('tagged_edges').default(0),
  categoryEdges: integer('category_edges').default(0),
  coOccurrenceEdges: integer('co_occurrence_edges').default(0),
  
  // Graph metrics
  avgDegree: doublePrecision('avg_degree').default(0),
  maxDegree: integer('max_degree').default(0),
  density: doublePrecision('density').default(0),
  avgClusteringCoefficient: doublePrecision('avg_clustering_coefficient').default(0),
  
  // Top nodes by centrality
  topNodesByCentrality: jsonb('top_nodes_by_centrality').$type<Array<{ nodeId: number; score: number }>>(),
  
  // Orphan detection
  orphanNodes: integer('orphan_nodes').default(0),
  
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  snapshotDateIdx: index('graph_analytics_date_idx').on(table.snapshotDate),
}));

// User graph preferences
export const graph_user_preferences = pgTable('graph_user_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Visualization preferences
  defaultView: varchar('default_view', { 
    enum: ['full', 'article-centric', 'category', 'user', 'temporal'],
    length: 20
  }).default('full'),
  
  // Node/edge filters
  showNodeTypes: jsonb('show_node_types').$type<string[]>().default(['article', 'category', 'tag']),
  showEdgeTypes: jsonb('show_edge_types').$type<string[]>().default(['references', 'related_to']),
  
  // Visual settings
  nodeSizeBy: varchar('node_size_by', { 
    enum: ['centrality', 'degree', 'constant'],
    length: 20
  }).default('centrality'),
  
  edgeWidthBy: varchar('edge_width_by', { 
    enum: ['strength', 'constant'],
    length: 20
  }).default('strength'),
  
  // Layout preferences
  layoutAlgorithm: varchar('layout_algorithm', { 
    enum: ['force-directed', 'circular', 'hierarchical'],
    length: 20
  }).default('force-directed'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdx: index('graph_user_pref_user_idx').on(table.userId),
}));

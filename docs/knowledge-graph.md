# Knowledge Graph Visualization - OC-113

## Overview

The Knowledge Graph Visualization feature transforms AIdepedia from a collection of articles into an interconnected knowledge ecosystem. It provides interactive visualization of relationships between articles, categories, tags, and users.

## Features

### 1. Graph Data Model

#### Node Types
- **Articles**: Published encyclopedia entries
- **Categories**: Topic classifications
- **Tags**: Keywords and labels
- **Users**: Contributors and authors

#### Edge Types (Relationships)
- **references**: Article A links to Article B
- **related_to**: Articles share tags or categories
- **authored_by**: Article written by User
- **tagged_with**: Article has Tag
- **categorized_as**: Article belongs to Category
- **co_occurrence**: Items frequently appear together

### 2. Interactive Visualization

The graph uses D3.js for rendering with the following capabilities:

- **Zoom/Pan**: Mouse wheel or buttons to zoom, drag background to pan
- **Node Drag**: Click and drag nodes to rearrange
- **Node Click**: View node details and navigate to entity
- **Edge Hover**: See relationship details
- **Force Layout**: Automatic node positioning based on connections

### 3. Graph Views

#### Full Graph
Shows the complete knowledge network with all nodes and edges. Useful for overview and exploration.

#### Article-Centric
Focuses on one article and its immediate connections. Shows:
- Referenced articles
- Related articles (shared tags/categories)
- Author
- Tags
- Category

#### Category View
Shows all articles within a specific category and their interconnections.

#### User Contributions
Displays all articles authored by a specific user and their relationships.

#### Temporal View
Shows how the graph has evolved over time by filtering nodes/edges by creation date.

### 4. Relationship Management

#### Automatic Detection
The system automatically detects relationships by:
- Parsing article content for internal links `[[article-slug]]`
- Analyzing shared tags and categories
- Tracking author assignments
- Identifying co-occurrence patterns

#### Manual Relationships
Users can create custom relationships via the API:

```bash
POST /api/v1/graph/relationships
{
  "sourceType": "article",
  "sourceId": 123,
  "targetType": "article",
  "targetId": 456,
  "edgeType": "related_to",
  "strength": 0.8,
  "metadata": {
    "context": "Both discuss machine learning"
  }
}
```

### 5. Graph Analytics

#### Metrics
- **Total Nodes/Edges**: Graph size
- **Average Degree**: Average connections per node
- **Max Degree**: Most connected node
- **Graph Density**: Ratio of actual to possible edges
- **Clustering Coefficient**: How interconnected nodes are

#### Centrality
Measures node importance based on:
- Number of connections (degree)
- Connection strength
- Connection type diversity

Nodes with high centrality are hubs in the knowledge network.

#### Community Detection
Uses label propagation algorithm to detect clusters of related nodes. Communities represent topic areas or knowledge domains.

#### Orphan Detection
Identifies nodes with no connections that may need:
- Additional content
- More tags/categories
- Relationship updates

## API Endpoints

### GET /api/v1/graph
Retrieve graph data for visualization.

**Query Parameters:**
- `view`: full, article-centric, category, user, temporal
- `nodeId`: Entity ID for specific views
- `nodeType`: article, category, tag, user
- `types`: Node types to include (comma-separated)
- `edgeTypes`: Edge types to include (comma-separated)
- `limit`: Maximum nodes to return
- `minCentrality`: Minimum centrality score filter

**Response:**
```json
{
  "nodes": [
    {
      "id": "node-123",
      "type": "article",
      "label": "Machine Learning",
      "entityId": 123,
      "centrality": 0.85,
      "communityId": 5
    }
  ],
  "edges": [
    {
      "id": "edge-456",
      "source": "node-123",
      "target": "node-789",
      "type": "references",
      "strength": 1.0,
      "weight": 1
    }
  ]
}
```

### GET /api/v1/graph/analytics
Retrieve graph analytics.

**Actions:**
- `latest`: Get latest analytics snapshot
- `top-nodes`: Get nodes sorted by centrality
- `communities`: Get detected communities
- `orphans`: Get orphan nodes
- `history`: Get historical analytics

### POST /api/v1/graph/analytics
Create a new analytics snapshot (triggers recalculation).

### POST /api/v1/graph/relationships
Create a manual relationship.

### DELETE /api/v1/graph/relationships
Delete a relationship.

## Database Schema

### graph_nodes
Stores all nodes in the knowledge graph with pre-calculated metrics.

### graph_edges
Stores relationships between nodes with strength and metadata.

### graph_communities
Stores detected community information.

### graph_analytics
Stores periodic analytics snapshots for trend analysis.

### graph_user_preferences
Stores user preferences for graph visualization.

## Initialization

To build the knowledge graph from existing data:

```bash
cd apps/web
tsx src/lib/graph/init.ts init
```

To rebuild the graph from scratch:

```bash
tsx src/lib/graph/init.ts rebuild
```

To clear all graph data:

```bash
tsx src/lib/graph/init.ts clear
```

## Performance Considerations

### Scalability
- Graph data is paginated (default limit: 100 nodes)
- Centrality scores are pre-calculated
- Analytics are snapshot-based for historical comparison
- Force simulation uses optimized algorithms

### Caching
Consider implementing caching for:
- Frequently accessed graph views
- Analytics snapshots
- Top nodes by centrality

### Updates
Graph updates are triggered:
- On article publication
- On tag/category changes
- On manual relationship creation
- During scheduled analytics recalculation

## Future Enhancements

1. **Real-time Updates**: WebSocket integration for live graph updates
2. **Advanced Filters**: Date range, community, centrality filters
3. **Export Options**: Export graph as PNG, SVG, or JSON
4. **Path Finding**: Show shortest path between two nodes
5. **Recommendations**: Suggest related articles based on graph position
6. **Graph Search**: Search within graph by node properties
7. **Collaborative Filtering**: Better related article detection
8. **Graph Diff**: Visualize graph changes over time

## Technical Stack

- **Database**: PostgreSQL with Drizzle ORM
- **Visualization**: D3.js v7
- **Layout Algorithm**: Force-directed simulation
- **Community Detection**: Label propagation
- **Centrality**: Simplified betweenness approximation

## Maintenance

### Regular Tasks
1. Run analytics snapshot weekly: `POST /api/v1/graph/analytics`
2. Monitor orphan nodes and add relationships
3. Review community detection results
4. Update centrality scores as graph grows

### Monitoring
- Graph size (nodes/edges count)
- Orphan node count
- Community health (size distribution)
- Query performance

## Troubleshooting

### Graph Not Loading
- Check browser console for errors
- Verify API endpoint is accessible
- Check if graph has been initialized

### Slow Performance
- Reduce node limit in query
- Add minCentrality filter
- Check database indexes

### Missing Relationships
- Run graph initialization
- Check article content for proper link formatting
- Verify tags and categories are assigned

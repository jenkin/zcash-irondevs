export interface GraphMeta {
  generatedAt: string;
  repoCount: number;
  commitCount: number;
  authorCount: number;
  failedRepos: string[];
}

export interface Milestone {
  name: string;
  date: string;
}

export interface IdentitySummary {
  name: string;
  isBot: boolean;
  commitCount: number;
  aliasCount: number;
  githubLogin: string | null;
}

export interface SnapshotNode {
  id: string;
  name: string;
  isBot: boolean;
  degree: number;
  betweenness: number;
  community: number;
  isBridge: boolean;
  repos: string[];
}

export interface SnapshotEdge {
  source: string;
  target: string;
  weight: number;
}

export interface Snapshot {
  asOf: string;
  mode: "cumulative" | "window";
  density: number;
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  edgeCountFull?: number;
}

export interface CommunityEvent {
  kind: "formed" | "continued" | "merged" | "split" | "dissolved";
  at: string;
  from_communities: number[];
  to_communities: number[];
  members: string[];
}

export interface GraphData {
  meta: GraphMeta;
  milestones: Milestone[];
  identities: Record<string, IdentitySummary>;
  snapshots: Snapshot[];
  windowSnapshots: Snapshot[];
  communityEvents: CommunityEvent[];
  causalCentrality: Record<string, number> | null;
}

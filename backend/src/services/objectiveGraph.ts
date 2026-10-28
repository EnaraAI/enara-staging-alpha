// Prerequisite graph over learning objectives. Pure functions: callers load the
// objectives of one curriculum and pass them in.

export interface GraphNode {
  id: string;
  prerequisiteObjectiveIds: string[];
  status?: string;
}

// Returns one cycle (as a list of ids, first = last) or null. Archived
// objectives keep their edges for history but don't count.
export function findCycle(nodes: GraphNode[]): string[] | null {
  const live = new Map(nodes.filter((n) => n.status !== 'archived').map((n) => [n.id, n]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    state.set(id, 'visiting');
    stack.push(id);
    for (const pre of live.get(id)?.prerequisiteObjectiveIds || []) {
      if (!live.has(pre)) continue;
      if (state.get(pre) === 'visiting') return [...stack.slice(stack.indexOf(pre)), pre];
      if (!state.has(pre)) {
        const found = visit(pre);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };

  for (const id of [...live.keys()].sort()) {
    if (!state.has(id)) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

// All prerequisites of an objective, nearest first, with their depth.
export function prerequisiteClosure(nodes: GraphNode[], objectiveId: string): { id: string; depth: number }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Map<string, number>();
  let frontier = [objectiveId];
  for (let depth = 1; frontier.length && depth <= nodes.length; depth += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const pre of byId.get(id)?.prerequisiteObjectiveIds || []) {
        if (pre === objectiveId || seen.has(pre) || !byId.has(pre)) continue;
        seen.set(pre, depth);
        next.push(pre);
      }
    }
    frontier = next;
  }
  return [...seen.entries()].map(([id, depth]) => ({ id, depth })).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
}

// Objectives not yet met whose direct prerequisites are all met.
export function readyToLearn(nodes: GraphNode[], isMet: (id: string) => boolean): string[] {
  return nodes
    .filter((n) => n.status !== 'archived' && !isMet(n.id))
    .filter((n) => n.prerequisiteObjectiveIds.every((p) => isMet(p) || !nodes.some((x) => x.id === p && x.status !== 'archived')))
    .map((n) => n.id);
}

// Prerequisites (any depth) of an objective that are not met, nearest first.
export function weakPrerequisites(nodes: GraphNode[], objectiveId: string, isMet: (id: string) => boolean) {
  return prerequisiteClosure(nodes, objectiveId).filter((p) => !isMet(p.id));
}

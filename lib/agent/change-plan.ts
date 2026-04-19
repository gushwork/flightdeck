export interface ChangePlan {
  id: string;
  title: string;
  steps: PlanStep[];
  impact: string;
  rollback: string;
  category: 'atomic' | 'dependent';
}

export interface PlanStep {
  order: number;
  description: string;
  cliCommand: string;
  apiCall: {
    service: 'secretsmanager';
    action: string;
    params: Record<string, unknown>;
  };
  outputKey?: string;
}

export interface PlanExecution {
  planId: string;
  steps: StepResult[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled-back';
}

export interface StepResult {
  order: number;
  status: 'pending' | 'running' | 'success' | 'failed';
  output?: Record<string, unknown>;
  error?: string;
}

export function generatePlanId(): string {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function resolvePlaceholders(
  params: Record<string, unknown>,
  outputs: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('$STEP')) {
      const match = value.match(/^\$STEP(\d+)_(.+)$/);
      if (match) {
        const stepOutput = outputs.get(`STEP${match[1]}`);
        resolved[key] = stepOutput?.[match[2]] ?? value;
      } else {
        resolved[key] = value;
      }
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

export function planToCliCommands(plan: ChangePlan): string {
  return plan.steps
    .map((s) => `# Step ${s.order}: ${s.description}\n${s.cliCommand}`)
    .join('\n\n');
}

export function planToJson(plan: ChangePlan): string {
  return JSON.stringify(plan, null, 2);
}

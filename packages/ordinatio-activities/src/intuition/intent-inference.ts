// ===========================================
// OPERATIONAL INTUITION — Intent Inference
// ===========================================
// From a sequence of recent activities, infer
// what the user is trying to accomplish and
// predict what should happen next.
//
// This gives the agent situational awareness:
// "The user is onboarding Client Smith — they've
// measured them and created a fit profile. An
// order should follow."
// ===========================================

import type { ActivityWithRelations } from '../types';
import type { LearnedSequence, InferredIntent } from './types';

/**
 * Well-known operational workflows.
 * Each workflow is a sequence of actions that form a coherent intent.
 */
const KNOWN_WORKFLOWS: Array<{
  label: string;
  actions: string[];
  entityField: 'clientId' | 'orderId' | null;
}> = [
  {
    label: 'Client onboarding',
    actions: ['client.created', 'client.measurements_updated', 'client.fit_profile_created'],
    entityField: 'clientId',
  },
  {
    label: 'Order placement',
    actions: ['order.created', 'placement.pending', 'placement.processing', 'placement.completed'],
    entityField: 'orderId',
  },
  {
    label: 'Order recovery',
    actions: ['placement.failed', 'order.placement_retried', 'placement.pending'],
    entityField: 'orderId',
  },
  {
    label: 'Email follow-up',
    actions: ['email.linked_to_client', 'email.task_created', 'task.completed'],
    entityField: 'clientId',
  },
  {
    label: 'Fit profile update',
    actions: ['client.measurements_updated', 'client.fit_profile_created', 'client.fit_profile_updated'],
    entityField: 'clientId',
  },
  {
    label: 'Automation troubleshooting',
    actions: ['automation.failed', 'automation.dead_letter', 'automation.triggered'],
    entityField: null,
  },
];

/**
 * Infer active operational intents from recent activities.
 *
 * Combines two approaches:
 * 1. Known workflow matching: check if recent actions match known workflow prefixes
 * 2. Sequence-based prediction: use learned sequences to predict next actions
 *
 * @param recentActivities - Activities from the last 24-48 hours, sorted by time
 * @param sequences - Learned sequences for prediction
 * @param maxIntents - Maximum intents to return (default: 5)
 */
export function inferIntents(
  recentActivities: ActivityWithRelations[],
  sequences: LearnedSequence[],
  maxIntents = 5,
): InferredIntent[] {
  const intents: InferredIntent[] = [];

  // 1. Known workflow matching
  const workflowIntents = matchKnownWorkflows(recentActivities, sequences);
  intents.push(...workflowIntents);

  // 2. Sequence-based prediction for remaining tail activities
  const coveredIds = new Set(intents.flatMap(i => i.evidenceActions));
  const uncoveredTails = recentActivities.filter(a => !coveredIds.has(a.action));
  const tailIntents = inferFromSequences(uncoveredTails, sequences);
  intents.push(...tailIntents);

  // Deduplicate by entity context
  const seen = new Set<string>();
  const deduplicated = intents.filter(intent => {
    const key = `${intent.label}|${intent.entityContext.clientId ?? ''}|${intent.entityContext.orderId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduplicated.slice(0, maxIntents);
}

/**
 * Match recent activities against known workflow patterns.
 */
function matchKnownWorkflows(
  activities: ActivityWithRelations[],
  sequences: LearnedSequence[],
): InferredIntent[] {
  const intents: InferredIntent[] = [];
  const sorted = [...activities].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  for (const workflow of KNOWN_WORKFLOWS) {
    // Find activities matching this workflow's action sequence
    const entityGroups = workflow.entityField
      ? groupByEntity(sorted, workflow.entityField)
      : [['global', sorted] as const];

    for (const [entityId, entityActivities] of entityGroups) {
      const matchedActions = findWorkflowProgress(
        entityActivities.map(a => a.action),
        workflow.actions,
      );

      if (matchedActions.length < 2) continue; // Need at least 2 steps matched

      // Find what comes next in the workflow
      const nextIdx = matchedActions.length;
      const remainingWorkflow = workflow.actions.slice(nextIdx);

      // Enrich with learned sequence predictions
      const lastAction = matchedActions[matchedActions.length - 1]!;
      const predictions = predictFromSequences(lastAction, sequences);

      // Add workflow-predicted actions that aren't already in predictions
      for (const nextAction of remainingWorkflow) {
        if (!predictions.some(p => p.action === nextAction)) {
          predictions.push({
            action: nextAction,
            confidence: 0.5, // Workflow match but no learned data
            typicalDelayMs: 24 * 60 * 60 * 1000, // Default 24h
          });
        }
      }

      const entityContext: InferredIntent['entityContext'] = {};
      if (workflow.entityField === 'clientId' && entityId !== 'global') {
        entityContext.clientId = entityId;
      } else if (workflow.entityField === 'orderId' && entityId !== 'global') {
        entityContext.orderId = entityId;
      }

      intents.push({
        label: `${workflow.label} (${matchedActions.length}/${workflow.actions.length} steps)`,
        evidenceActions: matchedActions,
        predictedNext: predictions.slice(0, 3),
        entityContext,
      });
    }
  }

  return intents;
}

/**
 * For activities not covered by known workflows,
 * use learned sequences to predict what's next.
 */
function inferFromSequences(
  activities: ActivityWithRelations[],
  sequences: LearnedSequence[],
): InferredIntent[] {
  const intents: InferredIntent[] = [];

  // Group by the most recent activity per entity
  const latestByEntity = new Map<string, ActivityWithRelations>();
  for (const a of activities) {
    const key = a.clientId ?? a.orderId ?? 'global';
    const existing = latestByEntity.get(key);
    if (!existing || a.createdAt > existing.createdAt) {
      latestByEntity.set(key, a);
    }
  }

  for (const [_entityKey, activity] of latestByEntity) {
    const predictions = predictFromSequences(activity.action, sequences);
    if (predictions.length === 0) continue;

    intents.push({
      label: `Continuing from ${activity.action}`,
      evidenceActions: [activity.action],
      predictedNext: predictions.slice(0, 3),
      entityContext: {
        clientId: activity.clientId ?? undefined,
        orderId: activity.orderId ?? undefined,
      },
    });
  }

  return intents;
}

/**
 * Predict next actions from learned sequences.
 */
function predictFromSequences(
  currentAction: string,
  sequences: LearnedSequence[],
): InferredIntent['predictedNext'] {
  return sequences
    .filter(s => s.fromAction === currentAction)
    .sort((a, b) => b.confidence - a.confidence)
    .map(s => ({
      action: s.toAction,
      confidence: s.confidence,
      typicalDelayMs: s.medianDelayMs,
    }));
}

/**
 * Find how far into a workflow sequence the activities have progressed.
 * Returns the matched action names in order.
 */
function findWorkflowProgress(
  activityActions: string[],
  workflowActions: string[],
): string[] {
  const matched: string[] = [];
  let workflowIdx = 0;

  for (const action of activityActions) {
    if (workflowIdx >= workflowActions.length) break;
    if (action === workflowActions[workflowIdx]) {
      matched.push(action);
      workflowIdx++;
    }
  }

  return matched;
}

function groupByEntity(
  activities: ActivityWithRelations[],
  field: 'clientId' | 'orderId',
): Array<readonly [string, ActivityWithRelations[]]> {
  const groups = new Map<string, ActivityWithRelations[]>();
  for (const a of activities) {
    const value = a[field];
    if (!value) continue;
    const group = groups.get(value);
    if (group) {
      group.push(a);
    } else {
      groups.set(value, [a]);
    }
  }
  return Array.from(groups.entries());
}

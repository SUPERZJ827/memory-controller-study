export interface TrajectoryJob<Step> {
  trajectoryId: string;
  steps: readonly Step[];
}

export interface SchedulerOptions {
  concurrency: number;
  /** Default true. False records failures and lets other fixed workers finish. */
  failFast?: boolean;
}

export interface ScheduledFailure {
  trajectoryId: string;
  stepIndex: number;
  error: unknown;
}

export interface SchedulerResult {
  completedTrajectories: string[];
  failures: ScheduledFailure[];
}

/**
 * Runs independent trajectories concurrently while awaiting every step within a
 * trajectory before starting its successor. Sorted round-robin worker assignment
 * makes the schedule stable across resumes and avoids timing-dependent work stealing.
 */
export async function runTrajectorySchedule<Step>(
  jobs: readonly TrajectoryJob<Step>[],
  options: SchedulerOptions,
  runStep: (job: TrajectoryJob<Step>, step: Step, stepIndex: number) => Promise<void>,
): Promise<SchedulerResult> {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("concurrency must be a positive integer");
  }
  const seen = new Set<string>();
  const ordered = [...jobs].sort((a, b) => a.trajectoryId.localeCompare(b.trajectoryId));
  for (const job of ordered) {
    if (seen.has(job.trajectoryId)) throw new Error(`duplicate trajectory id ${job.trajectoryId}`);
    seen.add(job.trajectoryId);
  }
  const workerCount = Math.min(options.concurrency, Math.max(ordered.length, 1));
  const lanes = Array.from({ length: workerCount }, () => [] as TrajectoryJob<Step>[]);
  ordered.forEach((job, index) => lanes[index % workerCount]!.push(job));
  const completed: string[] = [];
  const failures: ScheduledFailure[] = [];
  let firstFailure: unknown;

  await Promise.all(
    lanes.map(async (lane) => {
      for (const job of lane) {
        if (options.failFast !== false && firstFailure !== undefined) break;
        let succeeded = true;
        for (let stepIndex = 0; stepIndex < job.steps.length; stepIndex += 1) {
          if (options.failFast !== false && firstFailure !== undefined) {
            succeeded = false;
            break;
          }
          try {
            await runStep(job, job.steps[stepIndex]!, stepIndex);
          } catch (error) {
            failures.push({ trajectoryId: job.trajectoryId, stepIndex, error });
            firstFailure ??= error;
            succeeded = false;
            break;
          }
        }
        if (succeeded) completed.push(job.trajectoryId);
      }
    }),
  );

  if (options.failFast !== false && firstFailure !== undefined) throw firstFailure;
  return {
    completedTrajectories: completed.sort(),
    failures: failures.sort(
      (a, b) => a.trajectoryId.localeCompare(b.trajectoryId) || a.stepIndex - b.stepIndex,
    ),
  };
}

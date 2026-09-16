import type { Job } from "./api";

type SeenJob = { status: string; requestId?: string; reported?: boolean };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const terminal = new Set(["succeeded", "failed", "cancelled", "canceled"]);

// Reports transitions observed by the client, not authoritative completion time.
// Historical terminal jobs on the first load are only a baseline.
export class JobLifecycle {
  private seen = new Map<string, SeenJob>();
  constructor(private readonly emit: (event: string, properties: Record<string, unknown>) => void, private readonly storage?: Storage, private readonly key = "fantivo_job_lifecycle") {
    try { this.seen = new Map(JSON.parse(storage?.getItem(key) || "[]")); } catch { /* Storage is optional. */ }
  }

  created(job: Job, requestId: string) {
    const previous = this.seen.get(job.id);
    this.seen.set(job.id, { ...previous, status: previous?.status || "submitted", requestId });
    this.observe([job]);
  }

  requestId(jobId: string) { return this.seen.get(jobId)?.requestId || ""; }

  observe(jobs: Job[]) {
    for (const job of jobs) {
      const previous = this.seen.get(job.id);
      const status = job.status.toLowerCase();
      let reported = previous?.reported ?? (!previous && terminal.has(status) && (status !== "succeeded" || Boolean(job.outputUrl)));
      if (previous && !previous.reported && terminal.has(status)) {
        // A success without a playable result still needs a later refresh.
        if (status !== "succeeded" || job.outputUrl) {
          this.emit(status === "succeeded" ? "generation_succeeded" : "generation_completion_failed", {
            job_id: job.id, request_id: previous.requestId || "", status,
            has_output: Boolean(job.outputUrl), failure_code: job.failureCode || "",
            observation_source: "client_job_status", completed_at: job.completedAt || job.finishedAt || "",
          });
          reported = true;
        }
      }
      this.seen.set(job.id, { ...previous, status, reported });
    }
    this.seen = new Map([...this.seen].slice(-200));
    try { this.storage?.setItem(this.key, JSON.stringify([...this.seen])); } catch { /* Storage is optional. */ }
  }
}

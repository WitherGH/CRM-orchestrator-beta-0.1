CREATE TYPE "public"."agent_role" AS ENUM('architect', 'designer', 'pm', 'reviewer', 'developer', 'tester');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'success', 'failed', 'killed', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."orchestrator_event_type" AS ENUM('tick.start', 'tick.end', 'task.moved', 'agent.started', 'agent.finished', 'pr.opened', 'pr.merged', 'cost.cap.warning', 'cost.cap.hit', 'error');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"agent_role" "agent_role" NOT NULL,
	"model" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "agent_run_status" NOT NULL,
	"exit_code" integer,
	"cost_usd" numeric(10, 4) DEFAULT 0 NOT NULL,
	"tokens_input" integer DEFAULT 0 NOT NULL,
	"tokens_output" integer DEFAULT 0 NOT NULL,
	"worktree_path" text,
	"branch" text,
	"pr_number" integer,
	"stdout_path" text NOT NULL,
	"stderr_path" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "agent_runs_cost_usd_non_negative" CHECK ("agent_runs"."cost_usd" >= 0),
	CONSTRAINT "agent_runs_tokens_input_non_negative" CHECK ("agent_runs"."tokens_input" >= 0),
	CONSTRAINT "agent_runs_tokens_output_non_negative" CHECK ("agent_runs"."tokens_output" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "daily_cost" (
	"date" date NOT NULL,
	"agent_role" text NOT NULL,
	"cost_usd" numeric(10, 4) DEFAULT 0 NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_cost_pkey" PRIMARY KEY("date","agent_role"),
	CONSTRAINT "daily_cost_cost_usd_non_negative" CHECK ("daily_cost"."cost_usd" >= 0),
	CONSTRAINT "daily_cost_tasks_completed_non_negative" CHECK ("daily_cost"."tasks_completed" >= 0)
);
--> statement-breakpoint
ALTER TABLE "daily_cost" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orchestrator_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"type" "orchestrator_event_type" NOT NULL,
	"task_id" text,
	"agent_run_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orchestrator_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orchestrator_events" ADD CONSTRAINT "orchestrator_events_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_task_id_idx" ON "agent_runs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "agent_runs_status_started_at_idx" ON "agent_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "agent_runs_role_started_at_idx" ON "agent_runs" USING btree ("agent_role","started_at");--> statement-breakpoint
CREATE INDEX "orchestrator_events_ts_idx" ON "orchestrator_events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "orchestrator_events_type_ts_idx" ON "orchestrator_events" USING btree ("type","ts");--> statement-breakpoint
CREATE INDEX "orchestrator_events_task_id_idx" ON "orchestrator_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "orchestrator_events_agent_run_id_idx" ON "orchestrator_events" USING btree ("agent_run_id");
CREATE TABLE `lighthouse_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`final_url` text NOT NULL,
	`form_factor` text NOT NULL,
	`throttling_method` text NOT NULL,
	`performance_score` integer,
	`accessibility_score` integer,
	`best_practices_score` integer,
	`seo_score` integer,
	`lcp_ms` real,
	`cls` real,
	`tbt_ms` real,
	`fcp_ms` real,
	`si_ms` real,
	`ttfb_ms` real,
	`summary_json` text NOT NULL,
	`json_report_path` text NOT NULL,
	`html_report_path` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lighthouse_runs_url_form_factor_created_at_idx` ON `lighthouse_runs` (`url`,`form_factor`,`created_at`);--> statement-breakpoint
CREATE INDEX `lighthouse_runs_created_at_idx` ON `lighthouse_runs` (`created_at`);
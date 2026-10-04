ALTER TABLE "components" RENAME COLUMN "est_purchase_cost" TO "est_shipping_cost";--> statement-breakpoint
ALTER TABLE "components" RENAME COLUMN "est_other_cost" TO "est_additional_cost";--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "category" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "shipping_cost" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "additional_cost" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "lead_time_days" integer;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "notes" text;
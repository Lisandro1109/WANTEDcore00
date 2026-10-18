CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"actor_id" text,
	"actor_name" text NOT NULL,
	"module" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"tone" text NOT NULL,
	"detail" text DEFAULT '{}' NOT NULL,
	"restored_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activity_tone_chk" CHECK ("activity"."tone" IN ('success', 'info', 'warning', 'error'))
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_parent_created_idx" ON "activity" USING btree ("parent_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_actor_idx" ON "activity" USING btree ("actor_id");
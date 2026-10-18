CREATE TABLE "member_role" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"name" text NOT NULL,
	"built_in_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "role_permission_module_chk" CHECK ("role_permission"."module" IN ('tables', 'crm', 'inbox', 'automations', 'members', 'settings')),
	CONSTRAINT "role_permission_action_chk" CHECK ("role_permission"."action" IN ('view', 'create', 'edit', 'delete', 'export', 'share', 'manage')),
	CONSTRAINT "role_permission_scope_chk" CHECK ("role_permission"."scope" IN ('all', 'own', 'assigned'))
);
--> statement-breakpoint
ALTER TABLE "member_role" ADD CONSTRAINT "member_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_role" ADD CONSTRAINT "member_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "role_parent_id_idx" ON "role" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_parent_name_idx" ON "role" USING btree ("parent_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "role_parent_builtin_idx" ON "role" USING btree ("parent_id","built_in_key") WHERE "role"."built_in_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "role_permission_unique_idx" ON "role_permission" USING btree ("role_id","module","action");
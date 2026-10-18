CREATE TABLE "member_permission" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "member_permission_module_chk" CHECK ("member_permission"."module" IN ('tables', 'crm', 'inbox', 'automations', 'members', 'settings')),
	CONSTRAINT "member_permission_action_chk" CHECK ("member_permission"."action" IN ('view', 'create', 'edit', 'delete', 'export', 'share', 'manage')),
	CONSTRAINT "member_permission_scope_chk" CHECK ("member_permission"."scope" IN ('all', 'own', 'assigned'))
);
--> statement-breakpoint
CREATE TABLE "member_table_access" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"target" text NOT NULL,
	"target_id" text DEFAULT '' NOT NULL,
	"create_rows" boolean DEFAULT false NOT NULL,
	"edit_rows" boolean DEFAULT false NOT NULL,
	"delete_rows" boolean DEFAULT false NOT NULL,
	"can_export" boolean DEFAULT false NOT NULL,
	"manage" boolean DEFAULT false NOT NULL,
	"create_tables" boolean DEFAULT false NOT NULL,
	"manage_sets" boolean DEFAULT false NOT NULL,
	"row_scope" text DEFAULT 'all' NOT NULL,
	CONSTRAINT "member_table_access_target_chk" CHECK ("member_table_access"."target" IN ('all', 'base', 'table')),
	CONSTRAINT "member_table_access_scope_chk" CHECK ("member_table_access"."row_scope" IN ('all', 'own', 'assigned'))
);
--> statement-breakpoint
ALTER TABLE "member_permission" ADD CONSTRAINT "member_permission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_table_access" ADD CONSTRAINT "member_table_access_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_table_access" ADD CONSTRAINT "member_table_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_permission_unique_idx" ON "member_permission" USING btree ("user_id","module","action");--> statement-breakpoint
CREATE UNIQUE INDEX "member_table_access_unique_idx" ON "member_table_access" USING btree ("user_id","target","target_id");--> statement-breakpoint
CREATE INDEX "member_table_access_target_idx" ON "member_table_access" USING btree ("target","target_id");
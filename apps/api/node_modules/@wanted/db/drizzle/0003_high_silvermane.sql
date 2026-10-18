CREATE TABLE "data_base" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_cell" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"row_id" text NOT NULL,
	"field_id" text NOT NULL,
	"value" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_field" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"table_id" text NOT NULL,
	"name" text NOT NULL,
	"field_type" text NOT NULL,
	"options" text DEFAULT '[]' NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "data_field_type_chk" CHECK ("data_field"."field_type" IN ('text', 'number', 'date', 'select', 'checkbox'))
);
--> statement-breakpoint
CREATE TABLE "data_row" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"table_id" text NOT NULL,
	"created_by" text,
	"assignee_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_table" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"base_id" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_view" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"table_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"config" text DEFAULT '{}' NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "data_view_kind_chk" CHECK ("data_view"."kind" IN ('grid', 'kanban', 'calendar', 'form'))
);
--> statement-breakpoint
ALTER TABLE "data_base" ADD CONSTRAINT "data_base_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_base" ADD CONSTRAINT "data_base_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_cell" ADD CONSTRAINT "data_cell_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_cell" ADD CONSTRAINT "data_cell_row_id_data_row_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."data_row"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_cell" ADD CONSTRAINT "data_cell_field_id_data_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."data_field"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_field" ADD CONSTRAINT "data_field_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_field" ADD CONSTRAINT "data_field_table_id_data_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."data_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_row" ADD CONSTRAINT "data_row_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_row" ADD CONSTRAINT "data_row_table_id_data_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."data_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_row" ADD CONSTRAINT "data_row_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_row" ADD CONSTRAINT "data_row_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_table" ADD CONSTRAINT "data_table_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_table" ADD CONSTRAINT "data_table_base_id_data_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."data_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_table" ADD CONSTRAINT "data_table_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_view" ADD CONSTRAINT "data_view_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_view" ADD CONSTRAINT "data_view_table_id_data_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."data_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_view" ADD CONSTRAINT "data_view_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_base_parent_id_idx" ON "data_base" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_base_parent_name_idx" ON "data_base" USING btree ("parent_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "data_cell_row_field_idx" ON "data_cell" USING btree ("row_id","field_id");--> statement-breakpoint
CREATE INDEX "data_field_table_id_idx" ON "data_field" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_field_table_name_idx" ON "data_field" USING btree ("table_id","name");--> statement-breakpoint
CREATE INDEX "data_row_parent_id_idx" ON "data_row" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "data_row_table_id_idx" ON "data_row" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "data_table_parent_id_idx" ON "data_table" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_table_base_name_idx" ON "data_table" USING btree ("base_id","name");--> statement-breakpoint
CREATE INDEX "data_view_table_id_idx" ON "data_view" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_view_table_name_idx" ON "data_view" USING btree ("table_id","name");
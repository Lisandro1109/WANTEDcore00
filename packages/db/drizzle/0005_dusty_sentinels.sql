DROP INDEX "data_base_parent_name_idx";--> statement-breakpoint
DROP INDEX "data_table_base_name_idx";--> statement-breakpoint
ALTER TABLE "data_base" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "data_row" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "data_table" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "data_base_deleted_at_idx" ON "data_base" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "data_row_deleted_at_idx" ON "data_row" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "data_table_deleted_at_idx" ON "data_table" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "data_base_parent_name_idx" ON "data_base" USING btree ("parent_id","name") WHERE "data_base"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "data_table_base_name_idx" ON "data_table" USING btree ("base_id","name") WHERE "data_table"."deleted_at" IS NULL;
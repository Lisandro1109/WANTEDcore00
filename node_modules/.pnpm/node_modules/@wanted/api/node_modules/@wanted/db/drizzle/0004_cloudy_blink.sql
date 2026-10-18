ALTER TABLE "data_field" DROP CONSTRAINT "data_field_type_chk";--> statement-breakpoint
ALTER TABLE "data_field" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_field" ADD COLUMN "format" text DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_field" ADD COLUMN "required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "data_field" ADD COLUMN "is_unique" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "data_field" ADD COLUMN "default_value" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "data_field" SET "format" = CASE "field_type"
  WHEN 'number' THEN 'decimal'
  WHEN 'date' THEN 'date'
  WHEN 'select' THEN 'list'
  WHEN 'checkbox' THEN 'boolean'
  WHEN 'uuid' THEN 'uuid'
  WHEN 'json' THEN 'json'
  ELSE 'plain'
END;--> statement-breakpoint
ALTER TABLE "data_field" ADD CONSTRAINT "data_field_format_chk" CHECK ((
        ("data_field"."field_type" = 'text' AND "data_field"."format" IN ('plain', 'email', 'phone', 'url', 'long'))
        OR ("data_field"."field_type" = 'number' AND "data_field"."format" IN ('integer', 'decimal', 'currency', 'percent'))
        OR ("data_field"."field_type" = 'date' AND "data_field"."format" IN ('date', 'datetime'))
        OR ("data_field"."field_type" = 'select' AND "data_field"."format" = 'list')
        OR ("data_field"."field_type" = 'checkbox' AND "data_field"."format" = 'boolean')
        OR ("data_field"."field_type" = 'uuid' AND "data_field"."format" = 'uuid')
        OR ("data_field"."field_type" = 'json' AND "data_field"."format" = 'json')
      ));--> statement-breakpoint
ALTER TABLE "data_field" ADD CONSTRAINT "data_field_type_chk" CHECK ("data_field"."field_type" IN ('text', 'number', 'date', 'select', 'checkbox', 'uuid', 'json'));
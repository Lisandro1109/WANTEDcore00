ALTER TABLE "data_field" DROP CONSTRAINT "data_field_format_chk";--> statement-breakpoint
ALTER TABLE "data_field" ADD COLUMN "length" integer;--> statement-breakpoint
ALTER TABLE "data_field" ADD CONSTRAINT "data_field_format_chk" CHECK ((
        ("data_field"."field_type" = 'text' AND "data_field"."format" IN ('plain', 'email', 'phone', 'url', 'long'))
        OR ("data_field"."field_type" = 'number' AND "data_field"."format" IN ('integer', 'decimal', 'currency', 'percent'))
        OR ("data_field"."field_type" = 'date' AND "data_field"."format" IN ('date', 'datetime'))
        OR ("data_field"."field_type" = 'select' AND "data_field"."format" = 'list')
        OR ("data_field"."field_type" = 'checkbox' AND "data_field"."format" = 'boolean')
        OR ("data_field"."field_type" = 'uuid' AND "data_field"."format" IN ('uuid', 'code'))
        OR ("data_field"."field_type" = 'json' AND "data_field"."format" = 'json')
      ));
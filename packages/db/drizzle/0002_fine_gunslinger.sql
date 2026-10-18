UPDATE "user"
SET "email" = lower(split_part("email", '@', 1)) || '@wanted.com'
WHERE split_part("email", '@', 2) IS DISTINCT FROM 'wanted.com';
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_domain_chk" CHECK ("user"."email" ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?@wanted\.com$');

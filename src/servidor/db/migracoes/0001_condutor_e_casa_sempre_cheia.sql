ALTER TABLE `carrinhas` ADD `condutor_id` text REFERENCES pessoas(id);--> statement-breakpoint
ALTER TABLE `casas` ADD `sempre_cheia` integer DEFAULT false NOT NULL;
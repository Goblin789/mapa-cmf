CREATE TABLE `indisponibilidades` (
	`id` text PRIMARY KEY NOT NULL,
	`pessoa_id` text NOT NULL,
	`inicio` text NOT NULL,
	`fim` text,
	FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `indisponibilidades_pessoa_idx` ON `indisponibilidades` (`pessoa_id`);--> statement-breakpoint
CREATE TABLE `problemas` (
	`id` text PRIMARY KEY NOT NULL,
	`casa_id` text,
	`carrinha_id` text,
	`texto` text NOT NULL,
	`aberto_em` text NOT NULL,
	`resolvido_em` text,
	FOREIGN KEY (`casa_id`) REFERENCES `casas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`carrinha_id`) REFERENCES `carrinhas`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "problemas_um_alvo" CHECK(("problemas"."casa_id" IS NOT NULL AND "problemas"."carrinha_id" IS NULL) OR ("problemas"."casa_id" IS NULL AND "problemas"."carrinha_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `problemas_casa_idx` ON `problemas` (`casa_id`);--> statement-breakpoint
CREATE INDEX `problemas_carrinha_idx` ON `problemas` (`carrinha_id`);--> statement-breakpoint
ALTER TABLE `lotes` ADD `reverte` text;
CREATE TABLE `pedidos_login` (
	`estado` text PRIMARY KEY NOT NULL,
	`nonce` text NOT NULL,
	`verificador` text NOT NULL,
	`destino` text NOT NULL,
	`criado_em` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pedidos_login_criado_idx` ON `pedidos_login` (`criado_em`);--> statement-breakpoint
CREATE TABLE `sessoes` (
	`id` text PRIMARY KEY NOT NULL,
	`utilizador_id` text NOT NULL,
	`criada_em` text NOT NULL,
	`ultimo_uso_em` text NOT NULL,
	`expira_em` text NOT NULL,
	FOREIGN KEY (`utilizador_id`) REFERENCES `utilizadores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessoes_utilizador_idx` ON `sessoes` (`utilizador_id`);--> statement-breakpoint
CREATE INDEX `sessoes_expira_idx` ON `sessoes` (`expira_em`);--> statement-breakpoint
CREATE INDEX `sessoes_ultimo_uso_idx` ON `sessoes` (`ultimo_uso_em`);--> statement-breakpoint
CREATE TABLE `utilizadores` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`nome` text NOT NULL,
	`criado_em` text NOT NULL,
	`ultima_entrada_em` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `utilizadores_email_unique` ON `utilizadores` (`email`);
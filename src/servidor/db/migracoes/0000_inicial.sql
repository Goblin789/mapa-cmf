CREATE TABLE `alteracoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lote_id` integer NOT NULL,
	`entidade` text NOT NULL,
	`entidade_id` text NOT NULL,
	`campo` text NOT NULL,
	`antes` text,
	`depois` text,
	FOREIGN KEY (`lote_id`) REFERENCES `lotes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `carrinhas` (
	`id` text PRIMARY KEY NOT NULL,
	`matricula` text NOT NULL,
	`matriculas_alternativas` text DEFAULT '[]' NOT NULL,
	`modelo` text,
	`lugares` integer NOT NULL,
	`dorme_casa_id` text,
	`dorme_local_id` text,
	`temporaria` integer DEFAULT false NOT NULL,
	`nota` text,
	`ordem` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`dorme_casa_id`) REFERENCES `casas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dorme_local_id`) REFERENCES `locais`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carrinhas_matricula_unique` ON `carrinhas` (`matricula`);--> statement-breakpoint
CREATE TABLE `casas` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`local_id` text NOT NULL,
	`apartamento` text,
	`lotacao` integer NOT NULL,
	`max_contrato` integer,
	`tolerado` integer,
	`nota_contrato` text,
	`senhorio` text,
	`equipamento` text,
	`ordem` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`local_id`) REFERENCES `locais`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `casas_nome_unique` ON `casas` (`nome`);--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`cor` text NOT NULL,
	`sigla` text NOT NULL,
	`interno` integer DEFAULT false NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_cor_unique` ON `clientes` (`cor`);--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_sigla_unique` ON `clientes` (`sigla`);--> statement-breakpoint
CREATE TABLE `locais` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`nome` text NOT NULL,
	`morada` text NOT NULL,
	`pais` text NOT NULL,
	`lat` real,
	`lng` real,
	`raio_m` integer DEFAULT 150 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`autor` text NOT NULL,
	`criado_em` text NOT NULL,
	`efetivo_em` text NOT NULL,
	`estado` text NOT NULL,
	`tipo` text NOT NULL,
	`comentario` text
);
--> statement-breakpoint
CREATE TABLE `obras` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`cliente_id` text NOT NULL,
	`local_id` text NOT NULL,
	`estacionamento_local_id` text,
	`origem` text NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`local_id`) REFERENCES `locais`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`estacionamento_local_id`) REFERENCES `locais`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pessoas` (
	`id` text PRIMARY KEY NOT NULL,
	`numero` text,
	`numero_original` text,
	`apelidos` text NOT NULL,
	`nome` text NOT NULL,
	`nome_curto` text NOT NULL,
	`nomes_alternativos` text DEFAULT '[]' NOT NULL,
	`cliente_id` text NOT NULL,
	`obra_id` text,
	`casa_id` text,
	`carrinha_id` text,
	`casa_a_confirmar` integer DEFAULT false NOT NULL,
	`carrinha_a_confirmar` integer DEFAULT false NOT NULL,
	`telefone` text,
	`tem_carta` integer,
	`carta_validade` text,
	`ativa` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`obra_id`) REFERENCES `obras`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`casa_id`) REFERENCES `casas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`carrinha_id`) REFERENCES `carrinhas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pessoas_numero_unique` ON `pessoas` (`numero`);--> statement-breakpoint
CREATE UNIQUE INDEX `pessoas_nome_curto_unique` ON `pessoas` (`nome_curto`);
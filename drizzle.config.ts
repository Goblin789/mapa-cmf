import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/servidor/db/esquema.ts',
  out: './src/servidor/db/migracoes',
});

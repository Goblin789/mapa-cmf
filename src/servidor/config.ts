// Configuração lida do ambiente (.env local ou variáveis do alojamento).

try {
  process.loadEnvFile('.env');
} catch {
  // Sem .env: usa só as variáveis do ambiente.
}

export const config = {
  porta: Number(process.env.PORTA ?? 8787),
  bd: process.env.BD ?? 'dados/mapa.db',
  pastaOrigem: process.env.PASTA_ORIGEM ?? '',
};

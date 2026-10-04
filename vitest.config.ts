import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    // Há testes pesados (disposição do mapa com as coordenadas reais, sequências aleatórias de lotes) que
    // levam 1–3,5 s sozinhos; na corrida completa, com todos os ficheiros em paralelo (ou no GitHub, com
    // menos núcleos), os 5 s por omissão às vezes não chegavam.
    testTimeout: 20_000,
  },
});

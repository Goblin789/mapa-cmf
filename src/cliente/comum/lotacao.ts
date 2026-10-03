// Aparência da lotação e dos avisos de contrato, partilhada pelo mapa e pelos painéis.
// A lotação nunca pinta o fundo dos nomes: vai só na pastilha do número, sempre com um símbolo além
// da cor (○ livre, ● cheio, ▲ a mais).
//
// Há clientes vermelhos (Costantini) e verdes (Galère) e o laranja é da marca CMF (ver docs/cores.md).
// Para a pastilha nunca parecer um nome, tem outra forma de cor: fundo claro, contorno e texto escuros
// do mesmo tom (os nomes são blocos de cor cheia, médios ou escuros). O texto tem sempre ≥ 6:1 de
// contraste com o fundo da pastilha.
// Os três fundos têm claridades e tons diferentes (verde quase branco, creme, rosa-salmão) para os
// níveis se distinguirem também com daltonismo vermelho-verde, onde verde, âmbar e vermelho claros
// ficavam iguais. "Gente a mais" é o fundo mais carregado: é o aviso que mais importa ver.

import type { AvisoContrato, NivelLotacao } from '../../dominio/ocupacao';

export const ESTILO_NIVEL: Record<
  NivelLotacao,
  { rotulo: string; simbolo: string; contorno: string; pastilha: string; corHex: string }
> = {
  livre: {
    rotulo: 'com lugares livres',
    simbolo: '○',
    contorno: 'border-green-700',
    // green-800 sobre green-50: 6,8:1
    pastilha: 'bg-green-50 text-green-800 ring-1 ring-inset ring-green-700',
    corHex: '#008236',
  },
  cheio: {
    rotulo: 'cheio',
    simbolo: '●',
    contorno: 'border-amber-600',
    // amber-900 sobre amber-100: 8,1:1
    pastilha: 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-600',
    corHex: '#e17100',
  },
  excesso: {
    rotulo: 'gente a mais',
    simbolo: '▲',
    contorno: 'border-red-700',
    // red-950 sobre red-300: 8,4:1
    pastilha: 'bg-red-300 text-red-950 ring-1 ring-inset ring-red-700',
    corHex: '#c10007',
  },
};

export const ESTILO_AVISO_CONTRATO: Record<AvisoContrato, { rotulo: string; classe: string } | null> = {
  sem_limite: null,
  dentro: null,
  acima_maximo: {
    rotulo: 'Acima do máximo do contrato',
    classe: 'bg-amber-100 text-amber-900 border-amber-400',
  },
  acima_tolerado: {
    rotulo: 'Acima do tolerado no contrato',
    classe: 'bg-red-100 text-red-900 border-red-500',
  },
};

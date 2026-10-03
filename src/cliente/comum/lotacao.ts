// Aparência da lotação e dos avisos de contrato, partilhada pelo mapa e pelos painéis.
// A lotação nunca pinta o fundo dos nomes (Costantini já é laranja e Phillipe BTP já é verde):
// vai no contorno do cartão e na pastilha do número, sempre com um símbolo além da cor.

import type { AvisoContrato, NivelLotacao } from '../../dominio/ocupacao';

export const ESTILO_NIVEL: Record<
  NivelLotacao,
  { rotulo: string; simbolo: string; contorno: string; pastilha: string; corHex: string }
> = {
  livre: {
    rotulo: 'com lugares livres',
    simbolo: '○',
    contorno: 'border-emerald-600',
    pastilha: 'bg-emerald-600 text-white',
    corHex: '#059669',
  },
  cheio: {
    rotulo: 'cheio',
    simbolo: '●',
    contorno: 'border-amber-500',
    pastilha: 'bg-amber-500 text-black',
    corHex: '#f59e0b',
  },
  excesso: {
    rotulo: 'gente a mais',
    simbolo: '▲',
    contorno: 'border-red-600',
    pastilha: 'bg-red-600 text-white',
    corHex: '#dc2626',
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

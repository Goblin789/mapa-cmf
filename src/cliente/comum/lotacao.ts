// Aparência da lotação e dos avisos de contrato, partilhada pelo mapa e pelos painéis.
// A lotação nunca pinta o fundo dos nomes: vai só na pastilha do número, sempre com um símbolo além
// da cor (○ livre, ● cheio, ▲ a mais).
//
// Os nomes são todos blocos de cor CLARA com texto quase-preto (ver docs/cores.md). Para a pastilha
// nunca parecer um nome, usa o desenho oposto:
// - com lugares livres e cheio: pastilha BRANCA, contorno e número no tom do nível (verde, âmbar);
// - gente a mais: pastilha CHEIA, vermelho escuro com o número a branco — o aviso que mais importa ver.
// Nenhum nome é branco nem escuro, por isso nenhuma pastilha se confunde com um nome.
// Entre "livre" e "cheio" (as duas brancas) o contorno muda de claridade: verde-escuro (green-800, o
// mesmo tom do número) e âmbar claro (amber-600). Com o green-700 os dois contornos ficavam com quase a
// mesma claridade na protanopia (ΔE00 7); com o green-800 ficam a ΔE00 ≥ 17 nas três visões. O símbolo
// (○ / ●) separa-os sempre; "gente a mais" é a única cheia.
// O número tem sempre ≥ 6:1 de contraste com o fundo da pastilha.

import type { AvisoContrato, NivelLotacao } from '../../dominio/ocupacao';

export const ESTILO_NIVEL: Record<
  NivelLotacao,
  { rotulo: string; simbolo: string; contorno: string; pastilha: string; corHex: string }
> = {
  livre: {
    rotulo: 'com lugares livres',
    simbolo: '○',
    contorno: 'border-green-800',
    // green-800 sobre branco: 7,1:1 (número e contorno)
    pastilha: 'bg-white text-green-800 ring-1 ring-inset ring-green-800',
    corHex: '#016630',
  },
  cheio: {
    rotulo: 'cheio',
    simbolo: '●',
    contorno: 'border-amber-600',
    // amber-800 sobre branco: 7,1:1
    pastilha: 'bg-white text-amber-800 ring-1 ring-inset ring-amber-600',
    corHex: '#e17100',
  },
  excesso: {
    rotulo: 'gente a mais',
    simbolo: '▲',
    contorno: 'border-red-800',
    // branco sobre red-700: 6,4:1
    pastilha: 'bg-red-700 text-white ring-1 ring-inset ring-red-800',
    corHex: '#9f0712',
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

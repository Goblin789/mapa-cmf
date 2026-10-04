// Regras puras do campo da morada (comum/CampoMorada.tsx, M2, docs/m2.md "Obras" e "Geocodificação"): o que
// o campo devolve, como se arruma o texto, quando se pede para confirmar o pino e se a morada que o serviço
// propõe para um ponto do mapa pode entrar sem perguntar. Sem React nem Leaflet, para se testar.

import { dentroDaRegiao, LIMITES } from '../../dominio/campos';
import type { Pais } from '../../dominio/tipos';

/** O que o campo devolve: a morada escrita (ou a do serviço), o país e a posição (null = sem pino). */
export interface ValorMorada {
  morada: string;
  pais: Pais;
  lat: number | null;
  lng: number | null;
}

/** Os países da lista, pela ordem em que aparecem (o Luxemburgo por omissão). */
export const NOMES_PAIS: readonly { pais: Pais; nome: string }[] = [
  { pais: 'LU', nome: 'Luxemburgo' },
  { pais: 'FR', nome: 'França' },
  { pais: 'BE', nome: 'Bélgica' },
  { pais: 'DE', nome: 'Alemanha' },
];

/** Abaixo disto o resultado da procura pode estar no sítio errado: pede-se para confirmar o pino. */
export const CONFIANCA_MINIMA = 0.8;

/** Uma morada vazia, no Luxemburgo e sem pino. */
export const MORADA_VAZIA: ValorMorada = { morada: '', pais: 'LU', lat: null, lng: null };

/**
 * A morada como se grava: sem espaços nas pontas, sem quebras de linha nem espaços repetidos, cortada em
 * LIMITES.textoLongo caracteres.
 */
export function limparMorada(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, LIMITES.textoLongo).trim();
}

/** Arredonda as coordenadas a 6 casas (≈ 10 cm): é o que se guarda. */
export function arredondarCoordenada(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** A morada tem pino e ele está dentro da região do mapa. */
export function temPinoValido(v: Pick<ValorMorada, 'lat' | 'lng'>): v is { lat: number; lng: number } {
  return v.lat !== null && v.lng !== null && dentroDaRegiao(v.lat, v.lng);
}

/** O resultado da procura é pouco certo: pede-se para confirmar o pino no mini-mapa. */
export function precisaConfirmarPino(confianca: number): boolean {
  return !(confianca >= CONFIANCA_MINIMA);
}

/**
 * Depois de pôr o pino no mini-mapa, o serviço propõe a morada desse ponto. Entra sem perguntar só se o campo
 * estiver vazio ou ainda tiver a última morada que o próprio campo lá pôs (a pessoa não escreveu nada
 * entretanto); senão fica como sugestão ("Usar esta morada"). Nunca se apaga o que a pessoa escreveu sem
 * perguntar.
 */
export function moradaEntraSemPerguntar(atual: string, ultimaAutomatica: string | null): boolean {
  const escrita = limparMorada(atual);
  return escrita === '' || (ultimaAutomatica !== null && escrita === limparMorada(ultimaAutomatica));
}

/** "49.611234, 6.129876" (para ler e para os leitores de ecrã). */
export function textoPosicao(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * Ao abrir o campo com o pino já posto e sem morada (o "Nova obra aqui" do mapa), pede-se logo a morada e o
 * país desse ponto, como num clique no mini-mapa (senão a obra ficava com o país por omissão).
 */
export function pedirMoradaAoAbrir(
  v: ValorMorada,
  pedir: boolean,
): v is ValorMorada & { lat: number; lng: number } {
  return pedir && temPinoValido(v) && limparMorada(v.morada) === '';
}

/** Zoom do mini-mapa sem pino (o Luxemburgo inteiro), à volta de um centro dado (o bairro) e com pino (a rua). */
export const ZOOM_MINI_MAPA = { semPino: 9, centroInicial: 15, comPino: 16 } as const;
const CENTRO_SEM_PINO: readonly [number, number] = [49.65, 6.13];

/**
 * Onde o mini-mapa abre: no pino, se houver; senão no `centroInicial` (ex.: o pino da obra, para pôr o
 * estacionamento ao lado), se estiver na região; senão no Luxemburgo inteiro.
 */
export function vistaInicialMiniMapa(
  v: Pick<ValorMorada, 'lat' | 'lng'>,
  centroInicial: { lat: number; lng: number } | null,
): { centro: [number, number]; zoom: number } {
  if (v.lat !== null && v.lng !== null) return { centro: [v.lat, v.lng], zoom: ZOOM_MINI_MAPA.comPino };
  if (centroInicial && dentroDaRegiao(centroInicial.lat, centroInicial.lng)) {
    return { centro: [centroInicial.lat, centroInicial.lng], zoom: ZOOM_MINI_MAPA.centroInicial };
  }
  return { centro: [...CENTRO_SEM_PINO], zoom: ZOOM_MINI_MAPA.semPino };
}

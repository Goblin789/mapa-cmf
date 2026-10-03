// Avisos do motor de arrastar para quem precisa de reagir (ex.: o mapa desliga o deslocamento
// enquanto se arrasta um nome e desloca-se sozinho quando o ponteiro chega perto da borda).
// O motor chama emitirInicio/emitirMovimento/emitirFim; os interessados registam-se aqui.

export interface OuvintesArrasto {
  /** Começou um arrasto (o nome já está "levantado"). */
  aoComecar?: () => void;
  /** O ponteiro moveu-se durante o arrasto (coordenadas do ecrã, como clientX/clientY). */
  aoMover?: (x: number, y: number) => void;
  /** O arrasto acabou (largado ou cancelado). */
  aoTerminar?: () => void;
}

const registados = new Set<OuvintesArrasto>();

/** Regista ouvintes; devolve a função que os retira. */
export function registarOuvintesArrasto(ouvintes: OuvintesArrasto): () => void {
  registados.add(ouvintes);
  return () => {
    registados.delete(ouvintes);
  };
}

export function emitirInicio(): void {
  for (const o of registados) o.aoComecar?.();
}

export function emitirMovimento(x: number, y: number): void {
  for (const o of registados) o.aoMover?.(x, y);
}

export function emitirFim(): void {
  for (const o of registados) o.aoTerminar?.();
}

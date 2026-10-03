import type { Estado } from '../../dominio/tipos';

export async function obterEstado(): Promise<Estado> {
  const resposta = await fetch('/api/estado', { headers: { accept: 'application/json' } });
  if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status} ao pedir o estado.`);
  return (await resposta.json()) as Estado;
}

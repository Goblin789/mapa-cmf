// Carrinha vista de cima: frente arredondada com a matrícula numa placa e a pastilha "ocupados/lugares",
// para-brisas, espelhos e um lugar por lugar (filas de bancos). Neutra (sem cor de cliente):
// a lotação vai no contorno e na pastilha. Atrás, a marca discreta "sugerido" quando o sítio onde
// dorme foi deduzido dos passageiros.
// Clicar na carrinha põe-na em foco; clicar na frente (placa) mostra/esconde os nomes.

import type { ConfiancaDormida } from '../../../dominio/dormidas';
import { ocupacaoCarrinha } from '../../../dominio/ocupacao';
import type { Id } from '../../../dominio/tipos';
import { ESTILO_NIVEL } from '../../comum/lotacao';
import { useLoja } from '../../estado/loja';
import { chaveCarrinha } from '../layout/grupos';
import type { GeometriaCarrinha } from '../layout/medidas';
import { classeDestaque, type Destaque, posicao, Seta } from './comum';
import { Lugar } from './Lugar';
import { PastilhaLotacao } from './PastilhaLotacao';

export const TEXTO_SUGERIDO = 'Onde dorme: sugerido — a maioria dos passageiros mora aqui';

interface Props {
  carrinhaId: Id;
  geometria: GeometriaCarrinha;
  x: number;
  y: number;
  confianca: ConfiancaDormida;
  podeAlternar: boolean;
  aberto: boolean;
  destaque: Destaque;
}

export function CartaoCarrinha({
  carrinhaId,
  geometria: g,
  x,
  y,
  confianca,
  podeAlternar,
  aberto,
  destaque,
}: Props) {
  const indices = useLoja((s) => s.indices);
  const definirFoco = useLoja((s) => s.definirFoco);
  const alternarExpandido = useLoja((s) => s.alternarExpandido);
  const carrinha = indices?.carrinhas.get(carrinhaId);
  if (!indices || !carrinha) return null;

  const passageiros = indices.passageiros.get(carrinhaId) ?? [];
  const oc = ocupacaoCarrinha(carrinha, passageiros.length);
  const estilo = ESTILO_NIVEL[oc.nivel];
  const nomes = g.nivel === 'nomes';
  const chave = chaveCarrinha(carrinhaId);
  const emFoco = destaque === 'foco';
  const sugerida = confianca === 'sugerida';
  const descricao = [
    carrinha.matricula,
    carrinha.modelo,
    `${oc.ocupados}/${oc.lugares} lugares`,
    estilo.rotulo,
    sugerida ? TEXTO_SUGERIDO : null,
    carrinha.nota,
  ]
    .filter(Boolean)
    .join(' · ');
  const raio = nomes ? '22px 22px 8px 8px' : '16px 16px 6px 6px';

  const conteudoFrente = (
    <>
      <span
        className={[
          'flex h-full min-w-0 flex-1 items-stretch overflow-hidden rounded-[3px] border border-slate-700 bg-white',
          nomes ? 'max-w-[120px]' : '',
        ].join(' ')}
      >
        {/* Faixa azul da matrícula europeia. */}
        <span className="w-[4px] shrink-0 bg-blue-700" aria-hidden="true" />
        <span
          className={[
            'min-w-0 flex-1 truncate px-0.5 text-center font-mono font-bold leading-none tracking-tight text-slate-900',
            nomes ? 'self-center text-xs' : 'self-center text-[10px]',
          ].join(' ')}
        >
          {carrinha.matricula}
        </span>
      </span>
      {/* No nível dos lugares não há espaço para a seta (a placa tem de caber). */}
      {podeAlternar && nomes && <Seta aberta={aberto} />}
      <PastilhaLotacao ocupados={oc.ocupados} lugares={oc.lugares} nivel={oc.nivel} grande={nomes} />
    </>
  );

  return (
    <div
      className={['absolute', classeDestaque(destaque)].join(' ')}
      style={{ left: x, top: y, width: g.largura, height: g.altura, borderRadius: raio }}
      data-cartao={chave}
    >
      {/* Espelhos. */}
      <span
        className="pointer-events-none absolute rounded-sm bg-slate-500"
        style={{ left: -3, top: g.parabrisas.y, width: 4, height: 6 }}
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute rounded-sm bg-slate-500"
        style={{ right: -3, top: g.parabrisas.y, width: 4, height: 6 }}
        aria-hidden="true"
      />
      <button
        type="button"
        className={['absolute inset-0 cursor-pointer border-2 bg-slate-50', estilo.contorno].join(' ')}
        style={{ borderRadius: raio }}
        title={descricao}
        aria-label={`${descricao}. Mostrar as ligações desta carrinha.`}
        aria-pressed={emFoco}
        onClick={() => definirFoco(emFoco ? null : { tipo: 'carrinha', id: carrinhaId })}
      />
      {podeAlternar ? (
        <button
          type="button"
          className="absolute z-[1] flex cursor-pointer items-center justify-center gap-1 rounded-sm hover:bg-slate-200/70"
          style={posicao(g.placa)}
          title={`${carrinha.matricula} · ${aberto ? 'esconder' : 'mostrar'} os nomes`}
          aria-expanded={aberto}
          onClick={() => alternarExpandido(chave)}
        >
          {conteudoFrente}
        </button>
      ) : (
        <div
          className="pointer-events-none absolute z-[1] flex items-center justify-center gap-1"
          style={posicao(g.placa)}
        >
          {conteudoFrente}
        </div>
      )}
      {/* Para-brisas (mais largo à frente). */}
      <span
        className="pointer-events-none absolute z-[1] bg-slate-600/75"
        style={{ ...posicao(g.parabrisas), clipPath: 'polygon(0 0, 100% 0, 92% 100%, 8% 100%)' }}
        aria-hidden="true"
      />
      {g.lugares.map((r, i) => (
        <Lugar
          key={`${r.x}:${r.y}`}
          pessoa={passageiros[i] ?? null}
          retangulo={r}
          nivel={g.nivel}
          aMais={i >= carrinha.lugares}
        />
      ))}
      {sugerida && (
        <span
          className={[
            // Sem cliques: o clique e o tooltip (com o texto "sugerido") são os da carrinha.
            'pointer-events-none absolute z-[1] flex items-center justify-center leading-none text-slate-500',
            nomes ? 'text-[10px] italic' : 'text-[11px] font-bold',
          ].join(' ')}
          style={posicao(g.marca)}
        >
          {nomes ? '≈ sugerido' : '≈'}
        </span>
      )}
    </div>
  );
}

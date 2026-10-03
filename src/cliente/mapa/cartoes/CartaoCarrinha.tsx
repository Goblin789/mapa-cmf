// Carrinha vista de cima, frente para cima: carroçaria clara e arredondada à frente, quatro rodas a sair
// dos lados, matrícula luxemburguesa no nariz, para-brisas escuro, calhas do tejadilho e um nome por linha
// (um por lugar), com o condutor sempre em primeiro e um volante. Atrás: "≈" quando o sítio onde dorme é
// só sugerido, e a pastilha "ocupados/lugares" (a única coisa com a cor do nível). Clicar põe a carrinha
// em foco; no modo de edição é um alvo (data-alvo).
// Compacta (modo compacto do mapa): mais curta e estreita, só a matrícula e a lotação; quem vai lá
// dentro (o condutor primeiro) fica no tooltip e na ficha do foco.
// Os carros (tipo 'carro') desenham-se como um carro visto de cima, no mesmo estilo: mais curto e
// redondo à frente e atrás, capô com a matrícula, os vidros à volta do tejadilho (para-brisas, laterais e
// de trás) e quatro rodas. O tooltip diz sempre se é carrinha ou carro, a marca e o modelo.

import type { ConfiancaDormida } from '../../../dominio/dormidas';
import { formatarMatricula } from '../../../dominio/matricula';
import { ocupacaoCarrinha } from '../../../dominio/ocupacao';
import { chaveAlvo } from '../../../dominio/operacoes';
import type { Carrinha, Id } from '../../../dominio/tipos';
import { ESTILO_NIVEL } from '../../comum/lotacao';
import { Matricula } from '../../comum/Matricula';
import { useLoja } from '../../estado/loja';
import type { Retangulo } from '../layout/geometria';
import { chaveCarrinha } from '../layout/grupos';
import type { GeometriaCarrinha } from '../layout/medidas';
import { CLASSE_FOCO_TECLADO, type Destaque, posicao, tracoDestaque } from './comum';
import { Lugares } from './Lugar';
import { PastilhaLotacao } from './PastilhaLotacao';

export const TEXTO_SUGERIDO = 'Onde dorme: sugerido — é onde moram mais passageiros';

interface Props {
  carrinhaId: Id;
  geometria: GeometriaCarrinha;
  x: number;
  y: number;
  confianca: ConfiancaDormida;
  destaque: Destaque;
}

/** Retângulo com cantos de cima mais redondos (o nariz) do que os de baixo. */
function caminhoCarrocaria(r: Retangulo, raioFrente: number, raioTras: number): string {
  const { x, y, largura: w, altura: h } = r;
  const a = raioFrente;
  const b = raioTras;
  return [
    `M${x + a} ${y}`,
    `H${x + w - a}`,
    `A${a} ${a} 0 0 1 ${x + w} ${y + a}`,
    `V${y + h - b}`,
    `A${b} ${b} 0 0 1 ${x + w - b} ${y + h}`,
    `H${x + b}`,
    `A${b} ${b} 0 0 1 ${x} ${y + h - b}`,
    `V${y + a}`,
    `A${a} ${a} 0 0 1 ${x + a} ${y}`,
    'Z',
  ].join(' ');
}

/**
 * Carroçaria do carro: os quatro cantos bem redondos (curvas mais cheias do que um arco) e a frente e a
 * traseira ligeiramente abauladas, como os para-choques vistos de cima.
 */
export function caminhoCarro(r: Retangulo, raioFrente: number, raioTras: number): string {
  const { x, y, largura: w, altura: h } = r;
  const a = raioFrente;
  const b = raioTras;
  /** Pontos de controlo das curvas dos cantos (0,45 do raio: entre um arco e um canto vivo). */
  const k = 0.45;
  /** Quanto a frente e a traseira se abaulam ao centro. */
  const bojo = 1.2;
  return [
    `M${x + a} ${y + bojo}`,
    `Q${x + w / 2} ${y - bojo} ${x + w - a} ${y + bojo}`,
    `C${x + w - a * k} ${y + bojo} ${x + w} ${y + a * k} ${x + w} ${y + a}`,
    `V${y + h - b}`,
    `C${x + w} ${y + h - b * k} ${x + w - b * k} ${y + h - bojo} ${x + w - b} ${y + h - bojo}`,
    `Q${x + w / 2} ${y + h + bojo} ${x + b} ${y + h - bojo}`,
    `C${x + b * k} ${y + h - bojo} ${x} ${y + h - b * k} ${x} ${y + h - b}`,
    `V${y + a}`,
    `C${x} ${y + a * k} ${x + a * k} ${y + bojo} ${x + a} ${y + bojo}`,
    'Z',
  ].join(' ');
}

const COR_VIDRO = '#334155';
const COR_RODA = '#1e293b';
const COR_LINHA = '#cbd5e1';

/**
 * Os vidros do carro vistos de cima, numa só peça escura à volta do tejadilho (onde vão os nomes):
 * para-brisas à frente (curvo), vidros laterais finos e vidro de trás. A carrinha não tem este anel:
 * tem só o para-brisas e as calhas do tejadilho.
 */
function DetalhesCarro({ g }: { g: GeometriaCarrinha }) {
  const p = g.parabrisas;
  const v = g.vidroTraseiro;
  if (!v) return null;
  const fora = { x: p.x, y: p.y, largura: p.largura, altura: v.y + v.altura - p.y };
  /** Largura dos vidros laterais (finos: de cima vê-se pouco deles). */
  const lado = 1.5;
  const dentro = {
    x: fora.x + lado,
    y: p.y + p.altura,
    largura: fora.largura - 2 * lado,
    altura: v.y - (p.y + p.altura),
  };
  return (
    <path
      className="vidros-carro"
      d={`${caminhoCarro(fora, 6, 4)} ${caminhoCarro(dentro, 3, 2.5)}`}
      fillRule="evenodd"
      fill={COR_VIDRO}
    />
  );
}

/** Para-brisas e calhas do tejadilho da carrinha. */
function DetalhesCarrinha({ g }: { g: GeometriaCarrinha }) {
  const p = g.parabrisas;
  const calhaTopo = p.y + p.altura + 2;
  const calhaFundo = g.estado.y - 2;
  return (
    <>
      <path
        d={`M${p.x} ${p.y} H${p.x + p.largura} L${p.x + p.largura - 3} ${p.y + p.altura} H${p.x + 3} Z`}
        fill={COR_VIDRO}
        stroke={COR_RODA}
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
      {/* Calhas do tejadilho. */}
      {calhaFundo > calhaTopo &&
        [g.corpo.x + 2.5, g.corpo.x + g.corpo.largura - 2.5].map((x) => (
          <line key={x} x1={x} y1={calhaTopo} x2={x} y2={calhaFundo} stroke={COR_LINHA} strokeWidth={1} />
        ))}
    </>
  );
}

/** "Carro YG 4474" / "Carrinha CF 5001". */
export function nomeDoVeiculo(c: Pick<Carrinha, 'tipo' | 'matricula'>): string {
  return `${c.tipo === 'carro' ? 'Carro' : 'Carrinha'} ${formatarMatricula(c.matricula)}`;
}

/** "Renault Megane" (o que houver), ou null. */
export function marcaEModelo(c: Pick<Carrinha, 'marca' | 'modelo'>): string | null {
  return [c.marca, c.modelo].filter(Boolean).join(' ') || null;
}

function Silhueta({ g, destaque }: { g: GeometriaCarrinha; destaque: Destaque }) {
  const traco = tracoDestaque(destaque);
  const carro = g.veiculo === 'carro';
  const corpo = {
    ...g.corpo,
    x: g.corpo.x + 0.5,
    y: g.corpo.y + 0.5,
    largura: g.corpo.largura - 1,
    altura: g.corpo.altura - 1,
  };
  return (
    <svg
      className="forma-carrinha pointer-events-none absolute left-0 top-0 overflow-visible"
      // O CSS do Leaflet dá z-index 200 aos svg do mapa: ficava por cima dos nomes.
      style={{ zIndex: 'auto' }}
      width={g.largura}
      height={g.altura}
      viewBox={`0 0 ${g.largura} ${g.altura}`}
      aria-hidden="true"
    >
      {/* Rodas por baixo da carroçaria: só se vê o que sai para os lados. */}
      {g.rodas.map((r) => (
        <rect
          key={`${r.x}:${r.y}`}
          x={r.x}
          y={r.y}
          width={r.largura}
          height={r.altura}
          rx={carro ? 2 : 1.75}
          fill={COR_RODA}
        />
      ))}
      <path
        className="forma-corpo"
        d={
          carro
            ? caminhoCarro(corpo, g.compacta ? 14 : 18, g.compacta ? 10 : 12)
            : caminhoCarrocaria(corpo, 11, 4)
        }
        fill="#f8fafc"
        stroke={traco.cor}
        strokeWidth={traco.largura}
        strokeDasharray={traco.tracejado}
      />
      {carro ? <DetalhesCarro g={g} /> : <DetalhesCarrinha g={g} />}
    </svg>
  );
}

export function CartaoCarrinha({ carrinhaId, geometria: g, x, y, confianca, destaque }: Props) {
  const indices = useLoja((s) => s.indices);
  const definirFoco = useLoja((s) => s.definirFoco);
  const carrinha = indices?.carrinhas.get(carrinhaId);
  if (!indices || !carrinha) return null;

  // O condutor vem sempre em primeiro (indices.passageiros).
  const passageiros = indices.passageiros.get(carrinhaId) ?? [];
  const condutorId = passageiros.some((p) => p.id === carrinha.condutorId) ? carrinha.condutorId : null;
  const oc = ocupacaoCarrinha(carrinha, passageiros.length);
  const estilo = ESTILO_NIVEL[oc.nivel];
  const emFoco = destaque === 'foco';
  const sugerida = confianca === 'sugerida';
  const carro = carrinha.tipo === 'carro';
  const descricao = [
    nomeDoVeiculo(carrinha),
    marcaEModelo(carrinha),
    `${oc.ocupados}/${oc.lugares} lugares`,
    estilo.rotulo,
    sugerida ? TEXTO_SUGERIDO : null,
    carrinha.nota,
    // Compacta (sem os nomes à vista): quem vai lá dentro fica no tooltip, a começar pelo condutor.
    g.compacta && passageiros.length > 0
      ? `Vão: ${passageiros.map((p) => (p.id === condutorId ? `${p.nomeCurto} (condutor)` : p.nomeCurto)).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="cartao-mapa absolute"
      style={{ left: x, top: y, width: g.largura, height: g.altura }}
      data-cartao={chaveCarrinha(carrinhaId)}
      data-alvo={chaveAlvo({ tipo: 'carrinha', id: carrinhaId })}
    >
      <Silhueta g={g} destaque={destaque} />
      <button
        type="button"
        className={`absolute inset-0 cursor-pointer ${carro ? 'rounded-t-[14px] rounded-b-[10px]' : 'rounded-t-xl rounded-b-sm'} ${CLASSE_FOCO_TECLADO}`}
        title={descricao}
        aria-label={`${descricao}. Mostrar as ligações ${carro ? 'deste carro' : 'desta carrinha'}.`}
        aria-pressed={emFoco}
        onClick={() => definirFoco(emFoco ? null : { tipo: 'carrinha', id: carrinhaId })}
      />
      <span
        className="pointer-events-none absolute flex items-center justify-center"
        style={posicao(g.placa)}
      >
        <Matricula matricula={carrinha.matricula} altura={g.placa.altura} />
      </span>
      {!g.compacta && (
        <Lugares
          pessoas={passageiros}
          lugares={g.lugares}
          capacidade={carrinha.lugares}
          condutorId={condutorId}
        />
      )}
      <div className="pointer-events-none absolute flex items-center gap-1" style={posicao(g.estado)}>
        {sugerida && (
          <span className="text-[11px] font-bold leading-3 text-slate-500" title={TEXTO_SUGERIDO}>
            ≈<span className="sr-only"> {TEXTO_SUGERIDO}</span>
          </span>
        )}
        <span className="ml-auto">
          <PastilhaLotacao ocupados={oc.ocupados} lugares={oc.lugares} nivel={oc.nivel} />
        </span>
      </div>
    </div>
  );
}

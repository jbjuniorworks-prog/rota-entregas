import {CHAVES, type Guarda} from './guarda';

// Conta quantas vezes cada botão do cartão é usado, e qual botão veio antes de qual. É para
// parar de decidir no chute quais botões ficam na frente: uma semana de rota responde.
// Não guarda endereço, pacote, horário nem posição — só o nome do botão e quantas vezes.

export interface LinhaDeUso {
  botao: string;
  antes: string;
  vezes: number;
}

export interface RetratoDeUso {
  dia: string;
  linhas: LinhaDeUso[];
}

interface Guardado {
  dia: string;
  ultimo: string;
  quando: number;
  contas: Record<string, number>;
}

// Dois toques separados por mais que isto não são uma sequência: são duas idas ao app.
export const JUNTOS = 120000;

export const hojeLocal = (agora = Date.now()) =>
  new Date(agora - new Date(agora).getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function retrato(g: Guardado): RetratoDeUso {
  return {
    dia: g.dia,
    linhas: Object.entries(g.contas).map(([chave, vezes]) => {
      const corte = chave.indexOf('|');
      return {botao: chave.slice(0, corte), antes: chave.slice(corte + 1), vezes};
    }),
  };
}

export function criarUso(guarda: Guarda, agora: () => number = Date.now) {
  const vazio = (dia: string): Guardado => ({dia, ultimo: '', quando: 0, contas: {}});
  const ler = (): Guardado => {
    const dia = hojeLocal(agora());
    const g = guarda.ler<Guardado | null>(CHAVES.uso, null);
    return g && g.dia === dia && g.contas ? g : vazio(dia);
  };

  return {
    // Devolve o retrato do dia inteiro, não o que acabou de acontecer. A fila entrega pelo menos
    // uma vez, então somar no servidor contaria duas vezes o que foi reenviado; mandando o
    // acumulado e ficando com o maior dos dois, reenviar não estraga nada.
    registrar(botao: string): RetratoDeUso {
      const g = ler(), t = agora();
      g.contas[botao + '|'] = (g.contas[botao + '|'] || 0) + 1;
      if (g.ultimo && t - g.quando <= JUNTOS) {
        const par = botao + '|' + g.ultimo;
        g.contas[par] = (g.contas[par] || 0) + 1;
      }
      g.ultimo = botao;
      g.quando = t;
      guarda.gravar(CHAVES.uso, g);
      return retrato(g);
    },
    doDia: (): RetratoDeUso => retrato(ler()),
  };
}

export type Uso = ReturnType<typeof criarUso>;

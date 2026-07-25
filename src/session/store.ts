import { create } from 'zustand';

import { clientConfig, configureClient, onSessionSignal, sessionEpoch } from '@/api/client';
import * as api from '@/api/endpoints';
import type { MatchDetail, PouleSummary, SessionScope } from '@/api/types';
import { clientHeader, defaultBaseUrl, deviceName } from '@/config/env';

import { clearSession, readSession, saveSession } from './secureStorage';

/**
 * Estados da sessão — spec §6, reescrita pelo contrato `2.0.0`.
 *
 * Deixou de haver **fases** de uma sessão e passou a haver **dois tipos** de sessão, que não
 * comunicam: `poule` arbitra o cartão de uma poule, `match` arbitra um combate de eliminatória e
 * mais nada. Não há transição de uma para a outra — uma poule que fecha não dá acesso ao quadro
 * dela, porque o quadro corre em códigos que este token não alcança.
 *
 * `read_only` é a poule fechada, com quadro ou sem ele; `complete` chega de um `401 poule_complete`
 * ou do "Concluir" do árbitro, e não é erro.
 */
export type SessionPhase = 'disconnected' | 'poule' | 'match' | 'read_only' | 'complete';

/** Porque é que a sessão acabou. É o que o ecrã de ligar escreve ao árbitro. */
export type EndReason = 'token_expired' | 'token_revoked' | 'poule_complete' | 'signed_out';

/** Avisar a menos disto do fim da janela deslizante de 60 min (contrato §6). */
export const EXPIRY_WARNING_MS = 5 * 60 * 1000;

interface SessionState {
  phase: SessionPhase;
  /** `true` enquanto a app verifica um token guardado no arranque. Evita piscar o ecrã de ligar. */
  restoring: boolean;
  baseUrl: string;
  scope: SessionScope | null;
  poule: PouleSummary | null;
  /** O combate desta sessão, com `scope: 'match'`. Vem já no `connect` (contrato §7). */
  match: MatchDetail | null;
  /** ISO-8601 UTC, da resposta ou do `X-Session-Expires-At`. */
  expiresAt: string | null;
  endReason: EndReason | null;

  /** Troca o PIN por um token. Lança `ApiError`/`NetworkError` — o ecrã é que os apresenta. */
  connect: (pin: string, baseUrl?: string) => Promise<void>;
  /** Valida no arranque um token guardado, sem escrever nada. */
  restore: () => Promise<void>;
  /** Botão "terminar sessão". Apaga o token local mesmo que o servidor não responda. */
  disconnect: () => Promise<void>;
  /**
   * Botão "concluir": o árbitro dá a competição por arbitrada antes de o servidor a encerrar.
   *
   * Muda de fase e mais nada — o retrato do que ficou feito é o que o ecrã de resumo mostra, e o
   * token só é revogado quando ele sair de lá. Um *poll* atrasado não desfaz isto: o `applySummary`
   * não tira ninguém de `complete`.
   */
  finish: () => void;
  /** Um *summary* fresco vindo de um *poll*: a poule, ou o combate desta sessão. */
  applySummary: (summary: { poule?: PouleSummary; match?: MatchDetail }) => void;
}

const disconnected = {
  phase: 'disconnected' as SessionPhase,
  restoring: false,
  scope: null,
  poule: null,
  match: null,
  expiresAt: null,
};

/**
 * A fase que um *summary* implica.
 *
 * Uma poule fechada é **sempre** só leitura — com quadro ou sem ele. Até à `1.5.0` ela abria o
 * quadro; na `2.0.0` o quadro corre em códigos que este token não alcança, e o que a app faz é
 * dizê-lo (contrato §7). Nenhum destes casos acaba a sessão.
 *
 * Um `scope` que a app não conheça **nunca** cai no ramo da poule: era assim que uma sessão de
 * combate acabava a pedir `/poules/undefined/bouts`. Desconhecido é desligado.
 */
export function phaseFor(
  scope: SessionScope,
  poule: PouleSummary | null,
  match: MatchDetail | null = null,
): SessionPhase {
  if (scope === 'match') return match ? 'match' : 'disconnected';
  if (scope !== 'poule') return 'disconnected';
  if (!poule) return 'disconnected';
  return poule.locked ? 'read_only' : 'poule';
}

/**
 * A chave da competição a que a sessão está ligada — a fila de submissões é por competição
 * (spec §8), e com um código por pista "competição" passou a querer dizer **pista**.
 *
 * Uma poule tem UUID; um combate tem o seu `id` opaco, e é esse que serve. Nada interpreta este
 * valor: é uma chave de agrupamento, não um identificador com significado.
 */
export function competitionKey(state: {
  poule: PouleSummary | null;
  match: MatchDetail | null;
}): string | null {
  return state.poule?.uuid ?? state.match?.id ?? null;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  ...disconnected,
  restoring: true,
  baseUrl: defaultBaseUrl,
  endReason: null,

  connect: async (pin, baseUrl = get().baseUrl) => {
    configureClient({ baseUrl, token: null, clientHeader });

    const response = await api.connect({ pin, device_name: deviceName });

    configureClient({ baseUrl, token: response.token });
    await saveSession({ token: response.token, baseUrl, scope: response.scope });

    set({
      phase: phaseFor(response.scope, response.poule, response.match),
      restoring: false,
      baseUrl,
      scope: response.scope,
      poule: response.poule,
      match: response.match,
      expiresAt: response.expires_at,
      endReason: null,
    });
  },

  restore: async () => {
    const stored = await readSession();

    if (!stored) {
      set({ ...disconnected, restoring: false });
      return;
    }

    configureClient({ baseUrl: stored.baseUrl, token: stored.token, clientHeader });

    try {
      const session = await api.getSession();

      set({
        phase: phaseFor(session.scope, session.poule, session.match),
        restoring: false,
        baseUrl: stored.baseUrl,
        scope: session.scope,
        poule: session.poule,
        match: session.match,
        expiresAt: session.expires_at,
        endReason: null,
      });
    } catch {
      // Um `401` já foi tratado pelo ouvinte lá em baixo, que limpa tudo e escreve a razão. Uma
      // falha de rede não é razão para deitar fora um token que pode estar bom: mostra-se o ecrã
      // de ligar na mesma, e a fila de submissões fica intacta.
      set({ restoring: false, baseUrl: stored.baseUrl });
    }
  },

  disconnect: async () => {
    // Um `401` já pode ter limpado o token — é o que acontece a sair do ecrã de competição
    // completa. Aí não há nada para revogar, e chamar o `DELETE` sem token só serve para apanhar
    // outro `401` e reescrever a razão do fim com "a sessão expirou", que não foi o que aconteceu.
    const hadToken = clientConfig().token !== null;

    // Primeiro localmente: quem carrega em "terminar sessão" não espera pela rede.
    set({ ...disconnected, endReason: 'signed_out' });
    configureClient({ token: null });
    await clearSession();

    if (!hadToken) return;

    try {
      await api.deleteSession();
    } catch {
      // O token expira sozinho em 60 min. Falhar a revogação não deixa nada por fechar aqui.
    }
  },

  finish: () => set({ phase: 'complete' }),

  applySummary: ({ poule, match }) =>
    set((state) => {
      const scope = state.scope;
      if (!scope) return state;

      const nextPoule = poule ?? state.poule;
      const nextMatch = match ?? state.match;

      return {
        poule: nextPoule,
        match: nextMatch,
        // `complete` não se desfaz com um *poll* atrasado: chega de um `401` ou do "Concluir" do
        // árbitro, e as duas coisas são decisões, não leituras.
        phase: state.phase === 'complete' ? state.phase : phaseFor(scope, nextPoule, nextMatch),
      };
    }),
}));

/**
 * A sessão aprende-se pelas respostas, não por um relógio local: o `X-Session-Expires-At` vem em
 * todas as respostas autenticadas, e é assim que a janela deslizante se conhece sem gastar um
 * pedido (contrato §6).
 */
onSessionSignal((signal) => {
  // Um sinal de um token que já foi substituído não manda em nada. É o `401` atrasado da sessão
  // anterior a chegar depois de o árbitro se ter voltado a ligar — apagá-la seria expulsá-lo de
  // uma sessão que está viva.
  if (signal.epoch !== sessionEpoch()) return;

  if (signal.kind === 'alive') {
    useSessionStore.setState({ expiresAt: signal.expiresAt });
    return;
  }

  const endReason: EndReason =
    signal.code === 'poule_complete'
      ? 'poule_complete'
      : signal.code === 'token_revoked'
        ? 'token_revoked'
        : 'token_expired';

  configureClient({ token: null });
  void clearSession();

  // A competição encerrada tem ecrã próprio e mantém o que estava carregado — não é um erro, é o
  // fim. Os outros dois voltam ao ecrã de ligar com a razão escrita. **A fila fica** nos três.
  useSessionStore.setState((state) =>
    endReason === 'poule_complete'
      ? { phase: 'complete', expiresAt: null, endReason }
      : { ...disconnected, baseUrl: state.baseUrl, endReason },
  );
});

/** Milissegundos até a sessão expirar. `null` sem sessão; negativo quando já passou. */
export function millisUntilExpiry(expiresAt: string | null, now = Date.now()): number | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) ? null : at - now;
}

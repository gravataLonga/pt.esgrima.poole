import { create } from 'zustand';

import { clientConfig, configureClient, onSessionSignal, sessionEpoch } from '@/api/client';
import * as api from '@/api/endpoints';
import type { PouleSummary, SessionScope, TournamentSummary } from '@/api/types';
import { clientHeader, defaultBaseUrl, deviceName } from '@/config/env';

import { clearSession, readSession, saveSession } from './secureStorage';

/**
 * Estados da sessão — spec §6.
 *
 * `poule` e `bracket` são **fases da mesma sessão**, não sessões diferentes: a transição acontece
 * sozinha quando um *poll* traz `locked: true` com `elimination` preenchido, e não pede código
 * novo. `read_only` é a poule fechada **sem** quadro; `complete` chega sempre de um
 * `401 poule_complete`, e não é erro.
 */
export type SessionPhase = 'disconnected' | 'poule' | 'bracket' | 'read_only' | 'complete';

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
  tournament: TournamentSummary | null;
  /** ISO-8601 UTC, da resposta ou do `X-Session-Expires-At`. */
  expiresAt: string | null;
  endReason: EndReason | null;
  /**
   * A app já levou o árbitro ao quadro nesta sessão.
   *
   * A transição `poule fechada → quadro` acontece **uma vez** (spec §6). Sem esta memória, o
   * ecrã da lista reencaminhava para o quadro a cada render, e o botão "voltar aos assaltos" do
   * quadro não fazia nada — a lista fechada continua a ser consultável, só a escrita é que fecha.
   */
  bracketAnnounced: boolean;

  /** Troca o PIN por um token. Lança `ApiError`/`NetworkError` — o ecrã é que os apresenta. */
  connect: (pin: string, baseUrl?: string) => Promise<void>;
  /** Valida no arranque um token guardado, sem escrever nada. */
  restore: () => Promise<void>;
  /** Botão "terminar sessão". Apaga o token local mesmo que o servidor não responda. */
  disconnect: () => Promise<void>;
  /** Um *summary* fresco vindo de um *poll*: é isto que muda a fase sozinho. */
  applySummary: (summary: { poule?: PouleSummary; tournament?: TournamentSummary }) => void;
  /** O ecrã do quadro montou: a transição automática já cumpriu o seu papel. */
  markBracketAnnounced: () => void;
}

const disconnected = {
  phase: 'disconnected' as SessionPhase,
  restoring: false,
  scope: null,
  poule: null,
  tournament: null,
  expiresAt: null,
  bracketAnnounced: false,
};

/**
 * A fase que um *summary* implica. Uma poule fechada **com** quadro abre o quadro; fechada sem
 * quadro é só leitura. Nenhuma das duas acaba a sessão (contrato §7).
 */
export function phaseFor(scope: SessionScope, poule: PouleSummary | null): SessionPhase {
  if (scope === 'tournament') return 'bracket';
  if (!poule || !poule.locked) return 'poule';
  return poule.elimination ? 'bracket' : 'read_only';
}

/** UUID da competição a que a sessão está ligada — a fila de submissões é por competição. */
export function competitionUuid(state: {
  poule: PouleSummary | null;
  tournament: TournamentSummary | null;
}): string | null {
  return state.poule?.uuid ?? state.tournament?.uuid ?? null;
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
      phase: phaseFor(response.scope, response.poule),
      restoring: false,
      baseUrl,
      scope: response.scope,
      poule: response.poule,
      tournament: response.tournament,
      expiresAt: response.expires_at,
      endReason: null,
      bracketAnnounced: false,
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
        phase: phaseFor(session.scope, session.poule),
        restoring: false,
        baseUrl: stored.baseUrl,
        scope: session.scope,
        poule: session.poule,
        tournament: session.tournament,
        expiresAt: session.expires_at,
        endReason: null,
        bracketAnnounced: false,
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

  applySummary: ({ poule, tournament }) =>
    set((state) => {
      const scope = state.scope;
      if (!scope) return state;

      const nextPoule = poule ?? state.poule;
      const nextTournament = tournament ?? state.tournament;

      const phase = state.phase === 'complete' ? state.phase : phaseFor(scope, nextPoule);

      return {
        poule: nextPoule,
        tournament: nextTournament,
        // `complete` só chega de um 401 (contrato §6): a competição pode estar toda pontuada e a
        // sessão continuar viva para arbitrar o quadro que ainda vai ser gerado.
        phase,
        // Sair do quadro rearma a transição — se a poule voltar a fechar, o árbitro é levado lá
        // outra vez em vez de ficar a olhar para uma lista que já não aceita resultados.
        bracketAnnounced: phase === 'bracket' ? state.bracketAnnounced : false,
      };
    }),

  markBracketAnnounced: () => set({ bracketAnnounced: true }),
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

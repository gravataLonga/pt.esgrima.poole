/**
 * Armazenamento do token em Keychain / Android Keystore, via `expo-secure-store`.
 *
 * Nunca `AsyncStorage`, nunca ficheiro, nunca log (spec §9).
 *
 * O que fica guardado é o token **e o que é preciso para o usar**: o `base_url` a que ele pertence
 * e o âmbito que alcança. Um token sozinho não diz a que servidor pertence, e a app relançada
 * apontaria o token de um servidor ao outro.
 */

import * as SecureStore from 'expo-secure-store';

import type { SessionScope } from '@/api/types';

const TOKEN_KEY = 'poole.referee.token';
const BASE_URL_KEY = 'poole.referee.base_url';
const SCOPE_KEY = 'poole.referee.scope';

export interface StoredSession {
  token: string;
  baseUrl: string;
  scope: SessionScope;
}

/**
 * Uma falha do Keychain — dispositivo sem código de acesso, keystore corrompida — não pode impedir
 * o árbitro de arbitrar. A sessão continua em memória; o que se perde é sobreviver a um relançar
 * da app, e isso resolve-se voltando a ligar com o mesmo PIN, que não se gasta (contrato §9).
 */
export async function saveSession(session: StoredSession): Promise<void> {
  try {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, session.token),
      SecureStore.setItemAsync(BASE_URL_KEY, session.baseUrl),
      SecureStore.setItemAsync(SCOPE_KEY, session.scope),
    ]);
  } catch {
    // Silêncio de propósito: registar o erro arrisca registar o valor com ele.
  }
}

export async function readSession(): Promise<StoredSession | null> {
  try {
    const [token, baseUrl, scope] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(BASE_URL_KEY),
      SecureStore.getItemAsync(SCOPE_KEY),
    ]);

    if (!token || !baseUrl) return null;

    // Um `scope` que esta versão não conheça — o `'tournament'` de uma instalação anterior à
    // `2.0.0`, por exemplo — não pode ser lido como poule: o token dele não alcança poule nenhuma.
    // Sem sessão utilizável, a app abre no ecrã de ligar, que custa seis dígitos.
    if (scope !== 'poule' && scope !== 'match') return null;

    return { token, baseUrl, scope };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(BASE_URL_KEY),
      SecureStore.deleteItemAsync(SCOPE_KEY),
    ]);
  } catch {
    // Idem. Quem apaga a sessão já limpou o que estava em memória.
  }
}

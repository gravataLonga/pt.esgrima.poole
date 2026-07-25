/**
 * Armazenamento do token em Keychain / Android Keystore, via `expo-secure-store`.
 *
 * Nunca `AsyncStorage`, nunca ficheiro, nunca log (spec §9).
 *
 * ESQUELETO — por implementar na F1, quando houver token para guardar.
 */

const TOKEN_KEY = 'poole.referee.token';

export function saveToken(_token: string): Promise<void> {
  return Promise.reject(new Error(`session/secureStorage: ${TOKEN_KEY} por implementar (F1)`));
}

export function readToken(): Promise<string | null> {
  return Promise.reject(new Error(`session/secureStorage: ${TOKEN_KEY} por implementar (F1)`));
}

export function clearToken(): Promise<void> {
  return Promise.reject(new Error(`session/secureStorage: ${TOKEN_KEY} por implementar (F1)`));
}

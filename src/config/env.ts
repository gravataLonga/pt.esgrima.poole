/**
 * Endpoint por omissão, por ambiente.
 *
 * Na maior parte dos casos isto não é usado: o `base_url` vem no payload do QR (contrato §9) e é
 * esse que manda. Este valor serve o caminho do PIN manual, onde não se leu QR nenhum e portanto
 * não há de onde tirar o servidor.
 *
 * O fallback é **produção**, não local: uma variável em falta — build sem `.env`, ambiente mal
 * configurado — não pode apontar a app de um árbitro em pavilhão para o portátil de alguém. Falhar
 * para produção é falhar do lado seguro.
 *
 * `EXPO_PUBLIC_*` é inlined no bundle em build-time e qualquer pessoa o extrai do APK. Um URL de
 * servidor não é segredo, mas nada que o seja pode entrar por aqui.
 */
export const defaultBaseUrl = process.env.EXPO_PUBLIC_BASE_URL ?? 'https://poole.esgrima.pt';

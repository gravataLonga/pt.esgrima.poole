import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { parseQr } from '@/qr/parse';
import { useSessionStore } from '@/session/store';
import { Banner, Button, Screen, Text, colors, radius, spacing } from '@/ui';

/**
 * Leitura do QR — rota própria, e não uma camada por cima do ecrã de ligar.
 *
 * A câmara ocupa o ecrã todo e tem ciclo de vida próprio: montada só enquanto se lê, largada assim
 * que se sai. Como camada dentro de `/connect` ficaria montada por baixo do formulário de PIN, com o
 * sensor ligado e o teclado numérico do PIN a competir por espaço com o visor.
 *
 * O resultado não volta ao ecrã anterior: um QR válido **é** a ligação, por isso este ecrã liga e
 * segue para a lista. Ver ADR-026.
 */
export default function ScanScreen() {
  const { t } = useTranslation();
  const connect = useSessionStore((s) => s.connect);
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);

  /**
   * `onBarcodeScanned` dispara a cada frame enquanto o código estiver enquadrado, não uma vez por
   * código. Sem tranca, um QR válido chamava `connect()` e `replace()` dezenas de vezes antes de o
   * ecrã seguinte montar. O `ref` é lido só aqui dentro, nunca durante o render (ADR-008).
   */
  const handled = useRef(false);

  const onBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    handled.current = true;

    const result = parseQr(data);

    switch (result.kind) {
      case 'payload':
        connect(result.payload.pin, result.payload.base_url);
        router.replace('/poule');
        return;

      // Só o PIN: hoje é o que a plataforma gera (contrato §9). Sem `base_url` no código, fica o
      // valor por omissão do store — a app não pergunta o servidor ao árbitro.
      case 'pin':
        connect(result.pin);
        router.replace('/poule');
        return;

      case 'unsupported_version':
        setError(t('scan.error.unsupportedVersion'));
        return;

      case 'insecure_base_url':
        setError(t('scan.error.insecure', { url: result.baseUrl }));
        return;

      case 'unrecognised':
        setError(t('scan.error.unrecognised'));
    }
  };

  const retry = () => {
    setError(null);
    handled.current = false;
  };

  // `null` enquanto o módulo não respondeu. É um piscar de olhos e não vale um estado de carregamento
  // próprio — o que não se pode é desenhar o pedido de permissão e retirá-lo logo a seguir.
  if (!permission)
    return (
      <Screen tone="dark">
        <View />
      </Screen>
    );

  if (!permission.granted) {
    return (
      <Screen tone="dark">
        <View style={styles.permission}>
          <Text variant="title" color={colors.light}>
            {t('scan.permissionTitle')}
          </Text>
          <Text color={colors.textMutedOnDark}>{t('scan.permissionBody')}</Text>

          {/* Depois de negada com "não voltar a perguntar", `requestPermission` resolve sem mostrar
              nada e o botão parecia avariado. Aí o único caminho são as Definições do sistema. */}
          <Button
            label={
              permission.canAskAgain ? t('scan.permissionGrant') : t('scan.permissionSettings')
            }
            onPress={() => {
              if (permission.canAskAgain) void requestPermission();
              else void Linking.openSettings();
            }}
          />
          <Button
            label={t('scan.usePin')}
            variant="secondaryOnDark"
            onPress={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen tone="dark">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="display" color={colors.light}>
            {t('scan.title')}
          </Text>
          <Text color={colors.textMutedOnDark}>{t('scan.hint')}</Text>
        </View>

        <View style={styles.viewfinder}>
          {/* `onBarcodeScanned` a `undefined` desliga a entrega de frames enquanto o erro está no
              ecrã: sem isto o mesmo QR mau voltava a ser lido por trás do banner. */}
          <CameraView
            testID="camera"
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={error ? undefined : onBarcodeScanned}
          />
        </View>

        <View style={styles.actions}>
          {error ? <Banner message={error} tone="danger" /> : null}
          {error ? <Button label={t('scan.retry')} onPress={retry} /> : null}
          <Button
            label={t('scan.usePin')}
            variant="secondaryOnDark"
            onPress={() => router.back()}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
    paddingTop: spacing.md,
  },
  permission: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  /** `overflow: hidden` é o que faz o raio recortar a imagem da câmara, no Android também. */
  viewfinder: {
    flex: 1,
    borderRadius: radius.r16,
    overflow: 'hidden',
    backgroundColor: colors.black,
  },
  actions: {
    gap: spacing.sm,
  },
});

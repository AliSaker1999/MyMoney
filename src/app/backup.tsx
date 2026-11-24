import { File, Paths } from 'expo-file-system';
import * as ExpoCrypto from 'expo-crypto';
import { Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { exportEncryptedBackup, type BackupCryptoProvider } from '@/services/backupService';
import { decryptAndValidateBackup, restoreBackupSnapshot } from '@/services/restoreService';
import { AppButton, AppText, Badge, Card, Field, IconTile, Notice, Screen, Section, spacing } from '@/ui';

const expoCryptoProvider: BackupCryptoProvider = {
  randomBytes: (length) => ExpoCrypto.getRandomBytesAsync(length),
  async encrypt(plaintext, key, iv, aad) {
    const encryptionKey = await ExpoCrypto.AESEncryptionKey.import(toArrayBufferView(key));
    const sealed = await ExpoCrypto.aesEncryptAsync(toArrayBufferView(plaintext), encryptionKey, {
      nonce: { bytes: toArrayBufferView(iv) },
      additionalData: toArrayBufferView(aad),
    });
    return await sealed.ciphertext({ encoding: 'bytes', includeTag: true }) as Uint8Array;
  },
  async decrypt(ciphertextWithTag, key, iv, aad) {
    const decryptionKey = await ExpoCrypto.AESEncryptionKey.import(toArrayBufferView(key));
    const sealed = ExpoCrypto.AESSealedData.fromParts(
      toArrayBufferView(iv),
      toArrayBufferView(ciphertextWithTag),
      16,
    );
    return ExpoCrypto.aesDecryptAsync(sealed, decryptionKey, {
      additionalData: toArrayBufferView(aad),
    });
  },
};

function toArrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

export default function BackupScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const exportBackup = async () => {
    setError(null);
    setStatus(null);
    setBusy('export');
    try {
      if (password !== confirmation) throw new Error(t('backup.passwordMismatch'));
      const envelope = await exportEncryptedBackup(database, password, '0.1.0', expoCryptoProvider);
      const file = new File(Paths.cache, `mymoney-${new Date().toISOString().replace(/[:.]/g, '-')}.mymoney-backup`);
      file.create({ overwrite: true });
      file.write(JSON.stringify(envelope));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: t('backup.shareTitle'),
        });
      }
      setStatus(t('backup.exported'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  };

  const restoreBackup = async () => {
    setError(null);
    setStatus(null);
    setBusy('restore');
    try {
      if (restoreConfirmation !== 'RESTORE') throw new Error(t('backup.restoreConfirmation'));
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || picked.assets.length === 0) return;
      const file = new File(picked.assets[0]!.uri);
      const envelope = JSON.parse(await file.text());
      const snapshot = await decryptAndValidateBackup(envelope, password, expoCryptoProvider);
      await restoreBackupSnapshot(database, snapshot);
      setStatus(t('backup.restored'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('backup.restoreFailed'));
    } finally {
      setBusy(null);
    }
  };

  const strongEnough = password.length >= 12;
  const matches = password.length > 0 && password === confirmation;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('backup.title') }} />

      <Card variant="muted" style={styles.intro}>
        <IconTile icon="shield-lock-outline" tint="primary" size={44} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{t('ui.backupIntroTitle')}</AppText>
          <AppText variant="label" tone="secondary">{t('backup.description')}</AppText>
        </View>
      </Card>

      {error ? <Notice tone="error" message={error} /> : null}
      {status ? <Notice tone="success" message={status} /> : null}

      <Section title={t('backup.password')}>
        <Card style={styles.form}>
          <Field
            label={t('backup.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            icon="key-outline"
            autoCapitalize="none"
            autoCorrect={false}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onPress={() => setShowPassword((value) => !value)}
                accessibilityLabel={showPassword ? t('ui.hidePassword') : t('ui.showPassword')}
              />
            }
          />
          <Field
            label={t('backup.confirmPassword')}
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry={!showPassword}
            icon="key-chain-variant"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.checks}>
            <Badge
              label={t('ui.passwordLength')}
              tint={strongEnough ? 'positive' : 'neutral'}
              icon={strongEnough ? 'check' : 'circle-outline'}
            />
            <Badge
              label={t('ui.passwordsMatch')}
              tint={matches ? 'positive' : 'neutral'}
              icon={matches ? 'check' : 'circle-outline'}
            />
          </View>
        </Card>
      </Section>

      <Section title={t('ui.exportSection')}>
        <Card style={styles.form}>
          <View style={styles.row}>
            <IconTile icon="export-variant" tint="info" />
            <AppText variant="label" tone="secondary" style={styles.flex}>{t('ui.exportDescription')}</AppText>
          </View>
          <AppButton
            icon="share-variant-outline"
            onPress={() => void exportBackup()}
            loading={busy === 'export'}
            disabled={busy !== null}
          >
            {t('backup.export')}
          </AppButton>
        </Card>
      </Section>

      <Section title={t('ui.restoreSection')}>
        <Card variant="danger" style={styles.form}>
          <Notice tone="warning" message={t('backup.restoreDescription')} />
          <Field
            label={t('backup.restoreConfirmation')}
            value={restoreConfirmation}
            onChangeText={setRestoreConfirmation}
            autoCorrect={false}
            autoCapitalize="characters"
            icon="alert-outline"
          />
          <AppButton
            variant="secondary"
            icon="file-restore-outline"
            onPress={() => void restoreBackup()}
            loading={busy === 'restore'}
            disabled={busy !== null || restoreConfirmation !== 'RESTORE'}
          >
            {t('backup.restore')}
          </AppButton>
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  form: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

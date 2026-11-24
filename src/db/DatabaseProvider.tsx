import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import type { DbDriver } from '@/db/driver';
import {
  type DatabaseBootstrapState,
} from '@/db/bootstrap';
import { databaseBootstrap } from '@/db/bootstrapInstance';
import { AppButton } from '@/ui/controls';
import { StatusScreen } from '@/ui/StatusScreen';
import { RecoveryScreen } from '@/security/RecoveryScreen';

const DatabaseContext = createContext<DbDriver | null>(null);

export function DatabaseProvider({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const [bootstrapState, setBootstrapState] = useState<DatabaseBootstrapState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void databaseBootstrap
      .initialize()
      .then((state) => {
        if (!active) return;
        setError(null);
        setBootstrapState(state);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause, t('common.error')));
      });

    return () => {
      active = false;
    };
  }, [attempt, t]);

  const applyAction = useCallback(
    async (operation: () => Promise<DatabaseBootstrapState>) => {
      setError(null);
      try {
        setBootstrapState(await operation());
      } catch (cause) {
        setError(errorMessage(cause, t('common.error')));
      }
    },
    [t],
  );

  if (error) {
    return (
      <StatusScreen icon="database-alert-outline" tint="negative" title={t('common.error')} message={error}>
        <AppButton icon="refresh" onPress={() => setAttempt((value) => value + 1)}>
          {t('security.retry')}
        </AppButton>
      </StatusScreen>
    );
  }

  if (!bootstrapState) return <StatusScreen icon="wallet-outline" loading />;

  if (bootstrapState.status === 'recovery') {
    return (
      <RecoveryScreen
        state={bootstrapState}
        onUseCandidate={(candidateId) =>
          applyAction(() => databaseBootstrap.useCandidate(candidateId))
        }
        onStartFresh={() => applyAction(() => databaseBootstrap.startFresh())}
        onReset={(confirmation) =>
          applyAction(() => databaseBootstrap.reset(confirmation))
        }
        error={error}
      />
    );
  }

  return (
    <DatabaseContext.Provider value={bootstrapState.database}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase(): DbDriver {
  const database = useContext(DatabaseContext);
  if (!database) throw new Error('useDatabase must be used inside a ready DatabaseProvider.');
  return database;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

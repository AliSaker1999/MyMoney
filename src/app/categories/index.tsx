import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import {
  archiveCategory,
  createCategory,
  listCategories,
  type Category,
  type CategoryKind,
} from '@/services/ledgerSetupService';
import {
  AppButton,
  Badge,
  categoryIcon,
  categoryLabel,
  Composer,
  ConfirmDialog,
  EmptyState,
  errorText,
  Field,
  IconAction,
  IconTile,
  ListGroup,
  ListRow,
  Notice,
  Screen,
  SegmentedControl,
} from '@/ui';

export default function CategoriesScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const [categories, setCategories] = useState<Category[]>([]);
  const [view, setView] = useState<CategoryKind>('expense');
  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [archiving, setArchiving] = useState<Category | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setCategories(await listCategories(database));
  }, [database]);

  useEffect(() => {
    let active = true;
    void listCategories(database)
      .then((nextCategories) => {
        if (active) setCategories(nextCategories);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause, t('common.error')));
      });
    return () => { active = false; };
  }, [database, t]);

  const addCategory = async () => {
    setError(null);
    setLoading(true);
    try {
      await createCategory(database, { name, kind });
      setName('');
      setView(kind);
      setComposerOpen(false);
      await reload();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const archive = async (categoryId: number) => {
    setArchiving(null);
    setError(null);
    setLoading(true);
    try {
      await archiveCategory(database, categoryId);
      await reload();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const kindOptions = [
    { value: 'expense' as const, label: t('ui.expenses') },
    { value: 'income' as const, label: t('ui.incomeShort') },
  ];
  const visible = categories.filter((item) => item.kind === view);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('categories.manageTitle') }} />

      <Composer
        open={composerOpen}
        onToggle={setComposerOpen}
        openLabel={t('categories.add')}
        closeLabel={t('common.cancel')}
        title={t('categories.add')}
      >
        <Field label={t('categories.name')} value={name} onChangeText={setName} icon="tag-outline" />
        <SegmentedControl value={kind} onChange={setKind} options={kindOptions} accessibilityLabel={t('categories.kind')} />
        <AppButton onPress={() => void addCategory()} disabled={loading || !name.trim()} loading={loading}>
          {t('categories.add')}
        </AppButton>
      </Composer>

      {error ? <Notice tone="error" message={error} /> : null}

      <SegmentedControl value={view} onChange={setView} options={kindOptions} accessibilityLabel={t('categories.kind')} />

      {visible.length === 0 ? (
        <EmptyState icon="shape-outline" title={t('ui.noCategories')} />
      ) : (
        <ListGroup>
          {visible.map((item) => {
            const label = categoryLabel(t, item.name, item.builtinKey);
            const archived = item.archivedAt !== null;
            return (
              <ListRow
                key={item.id}
                title={label}
                titleTone={archived ? 'muted' : 'default'}
                subtitle={item.builtinKey ? t('ui.builtIn') : t('ui.custom')}
                leading={
                  <IconTile
                    icon={categoryIcon(item.builtinKey, item.kind)}
                    tint={archived ? 'neutral' : item.kind === 'income' ? 'positive' : 'primary'}
                  />
                }
                trailing={
                  archived ? (
                    <Badge label={t('ui.archived')} />
                  ) : item.builtinKey === null ? (
                    <View>
                      <IconAction
                        icon="archive-arrow-down-outline"
                        accessibilityLabel={`${t('categories.archive')}: ${label}`}
                        onPress={() => setArchiving(item)}
                      />
                    </View>
                  ) : null
                }
              />
            );
          })}
        </ListGroup>
      )}

      <ConfirmDialog
        visible={archiving !== null}
        icon="archive-arrow-down-outline"
        title={t('categories.archive')}
        message={archiving ? t('ui.archiveCategoryMessage', { name: categoryLabel(t, archiving.name, archiving.builtinKey) }) : undefined}
        confirmLabel={t('categories.archive')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        onConfirm={() => archiving && void archive(archiving.id)}
        onDismiss={() => setArchiving(null)}
      />
    </Screen>
  );
}

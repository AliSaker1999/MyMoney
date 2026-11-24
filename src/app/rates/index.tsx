import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Checkbox } from 'react-native-paper';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { formatRate, parseRate } from '@/domain/money';
import {
  addRateQuote,
  archiveRateSource,
  createRateSource,
  deleteRateQuote,
  getPreferredRateSourceId,
  getRateQuoteReferenceCount,
  listRateQuotes,
  listRateSources,
  lookupRate,
  setPreferredRateSource,
  updateRateQuote,
  type RateLookup,
  type RateQuote,
  type RateSource,
} from '@/services/ratesService';
import {
  AppButton,
  AppText,
  Badge,
  Card,
  ChoiceChips,
  ConfirmDialog,
  EmptyState,
  Field,
  IconAction,
  IconTile,
  ListGroup,
  ListRow,
  Notice,
  Screen,
  Section,
  spacing,
  useDateFormat,
  useTokens,
} from '@/ui';

const today = () => new Date().toISOString().slice(0, 10);

export default function RatesScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const tokens = useTokens();
  const format = useDateFormat();
  const [sources, setSources] = useState<RateSource[]>([]);
  const [quotes, setQuotes] = useState<RateQuote[]>([]);
  const [preferredSourceId, setPreferredSourceId] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [lookupRefresh, setLookupRefresh] = useState(0);
  const [sourceName, setSourceName] = useState('');
  const [rateText, setRateText] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [note, setNote] = useState('');
  const [lookupDate, setLookupDate] = useState(today);
  const [lookupResult, setLookupResult] = useState<{
    key: string;
    value: RateLookup | null;
  } | null>(null);
  const [staleAcknowledgmentKey, setStaleAcknowledgmentKey] = useState<string | null>(null);
  const [editingQuoteId, setEditingQuoteId] = useState<number | null>(null);
  const [deletingQuote, setDeletingQuote] = useState<RateQuote | null>(null);
  const [deleteReferenceCount, setDeleteReferenceCount] = useState(0);
  const [archivingSource, setArchivingSource] = useState<RateSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lookupKey = `${sourceId ?? ''}:${lookupDate}`;
  const lookupReady = lookupResult?.key === lookupKey;
  const lookup = lookupReady ? lookupResult.value : null;
  const lookupAcknowledged = staleAcknowledgmentKey === lookupKey;

  const reload = useCallback(async () => {
    const [nextSources, nextQuotes, nextPreferredSourceId] = await Promise.all([
      listRateSources(database),
      listRateQuotes(database),
      getPreferredRateSourceId(database),
    ]);
    setSources(nextSources);
    setQuotes(nextQuotes);
    setPreferredSourceId(nextPreferredSourceId);
    setLookupRefresh((value) => value + 1);
    setSourceId((current) => {
      if (current !== null && nextSources.some((source) => source.id === current && !source.archived_at)) {
        return current;
      }
      if (
        nextPreferredSourceId !== null &&
        nextSources.some((source) => source.id === nextPreferredSourceId && !source.archived_at)
      ) {
        return nextPreferredSourceId;
      }
      return nextSources.find((source) => !source.archived_at)?.id ?? null;
    });
  }, [database]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(reload)
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause, t('common.error')));
      });
    return () => {
      active = false;
    };
  }, [reload, t]);

  useEffect(() => {
    let active = true;
    if (sourceId === null || !isIsoDate(lookupDate)) return;
    void lookupRate(database, sourceId, lookupDate)
      .then((result) => {
        if (active) setLookupResult({ key: lookupKey, value: result });
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause, t('common.error')));
      });
    return () => {
      active = false;
    };
  }, [database, lookupDate, lookupKey, lookupRefresh, sourceId, t]);

  const saveQuote = async () => {
    setError(null);
    if (sourceId === null) {
      setError(t('rates.sourceNameRequired'));
      return;
    }
    if (!isIsoDate(effectiveDate)) {
      setError(t('rates.invalidDate'));
      return;
    }
    try {
      const rateE4 = parseRate(rateText);
      const input = {
        effectiveDate,
        rateE4,
        note: note.trim() || null,
      };
      if (editingQuoteId === null) {
        await addRateQuote(database, sourceId, input);
      } else {
        await updateRateQuote(database, editingQuoteId, input);
      }
      setEditingQuoteId(null);
      setRateText('');
      setNote('');
      setError(null);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === 'MoneyParseError'
          ? t('rates.invalidRate')
          : errorMessage(cause, t('common.error')),
      );
    }
  };

  const addSource = async () => {
    setError(null);
    try {
      const id = await createRateSource(database, sourceName);
      setSourceName('');
      await reload();
      setSourceId(id);
    } catch (cause) {
      setError(errorMessage(cause, t('common.error')));
    }
  };

  const choosePreferred = async (id: number) => {
    setError(null);
    try {
      await setPreferredRateSource(database, id);
      await reload();
    } catch (cause) {
      setError(errorMessage(cause, t('common.error')));
    }
  };

  const beginEdit = (quote: RateQuote) => {
    setEditingQuoteId(quote.id);
    setSourceId(quote.sourceId);
    setRateText(formatRate(quote.rateE4));
    setEffectiveDate(quote.effectiveDate);
    setNote(quote.note ?? '');
  };

  const beginDelete = async (quote: RateQuote) => {
    setError(null);
    try {
      setDeleteReferenceCount(await getRateQuoteReferenceCount(database, quote.id));
      setDeletingQuote(quote);
    } catch (cause) {
      setError(errorMessage(cause, t('common.error')));
    }
  };

  const confirmDelete = async () => {
    if (!deletingQuote) return;
    setError(null);
    try {
      await deleteRateQuote(database, deletingQuote.id);
      setDeletingQuote(null);
      if (editingQuoteId === deletingQuote.id) setEditingQuoteId(null);
      await reload();
    } catch (cause) {
      setError(errorMessage(cause, t('common.error')));
    }
  };

  const confirmArchive = async () => {
    if (!archivingSource) return;
    setError(null);
    try {
      await archiveRateSource(database, archivingSource.id);
      setArchivingSource(null);
      await reload();
    } catch (cause) {
      setError(errorMessage(cause, t('common.error')));
    }
  };

  const sourceLabel = (source: RateSource) =>
    source.code ? t(`rateSource.${source.code}`) : (source.name ?? '');
  const quoteSourceLabel = (quote: RateQuote) =>
    quote.sourceCode
      ? t(`rateSource.${quote.sourceCode}`)
      : (quote.sourceName ?? '');

  const activeSources = sources.filter((source) => !source.archived_at);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('rates.manageTitle') }} />

      <Card variant="hero" style={styles.lookup}>
        <View style={styles.rowBetween}>
          <AppText variant="overline" tone="heroMuted" uppercase>{t('rates.lookup')}</AppText>
          {lookup ? <Badge label={lookup.sourceLabel} tint="hero" icon="source-branch" /> : null}
        </View>
        {sourceId !== null && isIsoDate(lookupDate) ? (
          !lookupReady ? (
            <ActivityIndicator color={tokens.heroText} style={styles.lookupLoading} />
          ) : lookup ? (
            <>
              <AppText variant="display" tone="hero" numeric numberOfLines={1} adjustsFontSizeToFit>
                {formatRate(lookup.rateE4)}
              </AppText>
              <AppText variant="label" tone="heroMuted">
                {`${t('rates.rate')} · ${t('ui.effective', { date: format.date(lookup.effectiveDate) })}`}
              </AppText>
            </>
          ) : (
            <AppText variant="body" tone="heroMuted">{t('rates.lookupMissing')}</AppText>
          )
        ) : (
          <AppText variant="body" tone="heroMuted">{t('rates.invalidDate')}</AppText>
        )}
      </Card>

      {lookupReady && lookup?.isStale ? (
        <Notice tone="warning" message={t('rates.staleRate', { days: lookup.ageDays })}>
          <Checkbox.Item
            label={t('rates.staleAcknowledgment')}
            status={lookupAcknowledged ? 'checked' : 'unchecked'}
            onPress={() => setStaleAcknowledgmentKey(lookupAcknowledged ? null : lookupKey)}
            color={tokens.primary}
            position="leading"
            style={styles.checkbox}
            labelStyle={[styles.checkboxLabel, { color: tokens.text }]}
          />
        </Notice>
      ) : null}

      <Section title={t('rates.source')}>
        <ChoiceChips
          scroll
          value={sourceId === null ? null : String(sourceId)}
          onChange={(value) => value && setSourceId(Number(value))}
          accessibilityLabel={t('rates.source')}
          options={activeSources.map((source) => ({
            value: String(source.id),
            label: sourceLabel(source),
            icon: preferredSourceId === source.id ? 'star' : undefined,
            disabled: editingQuoteId !== null,
          }))}
        />
        <Field
          label={t('rates.asOfDate')}
          value={lookupDate}
          onChangeText={(value) => {
            setLookupDate(value);
          }}
          autoCapitalize="none"
          icon="calendar-search"
        />
      </Section>

      <Section title={editingQuoteId === null ? t('rates.addQuote') : t('rates.editQuote')}>
        <Card style={styles.form}>
          {editingQuoteId !== null ? <Notice tone="info" message={t('ui.editingQuote')} /> : null}
          <View style={styles.twoUp}>
            <View style={styles.flex}>
              <Field label={t('rates.rate')} value={rateText} onChangeText={setRateText} keyboardType="decimal-pad" />
            </View>
            <View style={styles.flex}>
              <Field label={t('rates.date')} value={effectiveDate} onChangeText={setEffectiveDate} autoCapitalize="none" />
            </View>
          </View>
          <Field label={t('rates.note')} value={note} onChangeText={setNote} multiline icon="note-text-outline" />
          <View style={styles.buttonRow}>
            {editingQuoteId !== null ? (
              <View style={styles.flex}>
                <AppButton
                  variant="secondary"
                  onPress={() => {
                    setEditingQuoteId(null);
                    setRateText('');
                    setNote('');
                    setEffectiveDate(today());
                  }}
                >
                  {t('common.cancel')}
                </AppButton>
              </View>
            ) : null}
            <View style={styles.flex}>
              <AppButton disabled={sourceId === null} onPress={() => void saveQuote()} icon={editingQuoteId === null ? 'plus' : 'check'}>
                {editingQuoteId === null ? t('rates.addQuote') : t('rates.saveChanges')}
              </AppButton>
            </View>
          </View>
        </Card>
      </Section>

      {error ? <Notice tone="error" message={error} /> : null}

      <Section title={t('ui.rateHistory')}>
        {quotes.length === 0 ? (
          <EmptyState compact icon="chart-timeline-variant" title={t('rates.noQuotes')} />
        ) : (
          <ListGroup>
            {quotes.map((item) => {
              const archivedSource = sources.some(
                (source) => source.id === item.sourceId && Boolean(source.archived_at),
              );
              return (
                <ListRow
                  key={item.id}
                  title={formatRate(item.rateE4)}
                  subtitle={[quoteSourceLabel(item), format.date(item.effectiveDate), item.note].filter(Boolean).join(' · ')}
                  leading={<IconTile icon="swap-horizontal" tint={editingQuoteId === item.id ? 'primary' : 'neutral'} />}
                  trailing={
                    <View style={styles.trailing}>
                      <IconAction
                        icon="pencil-outline"
                        size={36}
                        disabled={archivedSource}
                        accessibilityLabel={t('rates.editQuote')}
                        onPress={() => beginEdit(item)}
                      />
                      <IconAction
                        icon="trash-can-outline"
                        size={36}
                        accessibilityLabel={t('rates.deleteQuote')}
                        onPress={() => void beginDelete(item)}
                      />
                    </View>
                  }
                />
              );
            })}
          </ListGroup>
        )}
      </Section>

      <Section title={t('ui.rateSources')}>
        <ListGroup>
          {sources.map((source) => {
            const isPreferred = preferredSourceId === source.id;
            const archived = Boolean(source.archived_at);
            return (
              <ListRow
                key={source.id}
                title={sourceLabel(source)}
                titleTone={archived ? 'muted' : 'default'}
                subtitle={archived ? t('rates.sourceArchived') : source.is_builtin ? t('ui.builtIn') : t('ui.custom')}
                leading={<IconTile icon={isPreferred ? 'star' : 'source-branch'} tint={isPreferred ? 'warning' : 'neutral'} />}
                trailing={
                  <View style={styles.trailing}>
                    {isPreferred ? (
                      <Badge label={t('rates.preferred')} tint="warning" />
                    ) : !archived ? (
                      <AppButton variant="ghost" size="sm" compact onPress={() => void choosePreferred(source.id)}>
                        {t('ui.makePreferred')}
                      </AppButton>
                    ) : null}
                    {!source.is_builtin && !archived ? (
                      <IconAction
                        icon="archive-arrow-down-outline"
                        size={36}
                        accessibilityLabel={`${t('rates.archiveSource')}: ${sourceLabel(source)}`}
                        onPress={() => setArchivingSource(source)}
                      />
                    ) : null}
                  </View>
                }
              />
            );
          })}
        </ListGroup>
        <View style={styles.addSource}>
          <View style={styles.flex}>
            <Field label={t('rates.rateSourceName')} value={sourceName} onChangeText={setSourceName} autoCapitalize="words" />
          </View>
          <AppButton variant="tonal" icon="plus" onPress={() => void addSource()} disabled={!sourceName.trim()} style={styles.addSourceButton}>
            {t('rates.addSource')}
          </AppButton>
        </View>
      </Section>

      <ConfirmDialog
        visible={deletingQuote !== null}
        icon="trash-can-outline"
        title={t('rates.deleteQuote')}
        message={t('rates.confirmDelete')}
        confirmLabel={t('rates.deleteQuote')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void confirmDelete()}
        onDismiss={() => setDeletingQuote(null)}
      >
        {deleteReferenceCount > 0 ? (
          <Notice tone="warning" message={t('rates.transactionReferences', { count: deleteReferenceCount })} />
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        visible={archivingSource !== null}
        icon="archive-arrow-down-outline"
        title={t('rates.archiveSource')}
        message={archivingSource ? t('rates.archiveSourceConfirmation', { name: sourceLabel(archivingSource) }) : undefined}
        confirmLabel={t('rates.archiveSource')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        onConfirm={() => void confirmArchive()}
        onDismiss={() => setArchivingSource(null)}
      />
    </Screen>
  );
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  lookup: { gap: spacing.xs, paddingVertical: spacing.xl },
  lookupLoading: { alignSelf: 'flex-start', marginVertical: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  checkbox: { paddingHorizontal: 0, marginStart: -spacing.sm },
  checkboxLabel: { fontSize: 14, textAlign: 'auto' },
  form: { gap: spacing.xs },
  twoUp: { flexDirection: 'row', gap: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  addSource: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  addSourceButton: { marginTop: 6 },
});

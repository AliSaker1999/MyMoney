import { useTranslation } from 'react-i18next';

import type { LedgerTransaction } from '@/services/ledgerService';
import { categoryIcon, categoryLabel, kindIcon, kindTint, useDateFormat } from '@/ui/domain';
import { Amount } from '@/ui/money';
import { IconTile, ListRow } from '@/ui/surfaces';

export function TransactionRow({
  transaction,
  onPress,
  showDate = true,
}: {
  transaction: LedgerTransaction;
  onPress?: () => void;
  showDate?: boolean;
}) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const kindLabel = t(`transactions.${transaction.kind}`);

  if (transaction.kind === 'transfer') {
    const source = transaction.entries.find((entry) => entry.amountMinor < 0n) ?? transaction.entries[0];
    const destination = transaction.entries.find(
      (entry) => entry.amountMinor > 0n && entry.accountId !== source?.accountId,
    );
    const route = [source?.accountName, destination?.accountName].filter(Boolean).join(' → ');
    return (
      <ListRow
        title={transaction.payee || kindLabel}
        subtitle={route || kindLabel}
        leading={<IconTile icon={kindIcon('transfer')} tint={kindTint('transfer')} />}
        trailing={source ? <Amount minor={source.amountMinor} currency={source.currency} kind="transfer" /> : null}
        trailingCaption={showDate ? format.shortDate(transaction.date) : kindLabel}
        onPress={onPress}
        accessibilityHint={t('ui.openTransaction')}
      />
    );
  }

  const entry = transaction.entries[0];
  const category = entry ? categoryLabel(t, entry.categoryName, entry.categoryBuiltinKey) : '';
  const icon = entry?.categoryBuiltinKey || entry?.categoryName
    ? categoryIcon(entry.categoryBuiltinKey, transaction.kind === 'expense' ? 'expense' : 'income')
    : kindIcon(transaction.kind);
  const subtitle = [category && transaction.payee ? category : kindLabel, entry?.accountName]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListRow
      title={transaction.payee || category || kindLabel}
      subtitle={subtitle}
      leading={<IconTile icon={icon} tint={kindTint(transaction.kind)} />}
      trailing={entry ? <Amount minor={entry.amountMinor} currency={entry.currency} kind={transaction.kind} /> : null}
      trailingCaption={showDate ? format.shortDate(transaction.date) : kindLabel}
      onPress={onPress}
      accessibilityHint={t('ui.openTransaction')}
    />
  );
}

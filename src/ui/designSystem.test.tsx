import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import type { ReactNode } from 'react';

import { resources } from '@/i18n/resources';
import { ChoiceChips, SegmentedControl } from '@/ui/controls';
import { shiftMonth } from '@/ui/domain';
import { compactNumber, moneyText } from '@/ui/money';
import { darkTheme, lightTheme } from '@/ui/theme';

const LRI = '⁦';
const PDI = '⁩';

describe('money display', () => {
  it.each([
    [123_456n, 'USD', 'auto', '$1,234.56'],
    [-123_456n, 'USD', 'auto', '−$1,234.56'],
    [5_000n, 'USD', 'plus', '+$50.00'],
    [-5_000n, 'USD', 'minus', '−$50.00'],
    [1_500_000n, 'LBP', 'auto', '1,500,000 LBP'],
    [-90_000n, 'LBP', 'none', '90,000 LBP'],
  ] as const)('formats %s %s with sign %s', (amount, currency, sign, expected) => {
    expect(moneyText(amount, currency, { sign })).toBe(`${LRI}${expected}${PDI}`);
  });

  it.each([
    [999, '999'],
    [1_200, '1.2k'],
    [250_000, '250k'],
    [3_400_000, '3.4M'],
    [-1_500, '−1.5k'],
  ])('compacts %s to %s', (value, expected) => {
    expect(compactNumber(value)).toBe(expected);
  });

  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', 2)).toBe('2027-01');
    expect(shiftMonth('2026-06', -17)).toBe('2025-01');
  });
});

describe('themes', () => {
  it('exposes matching token sets for light and dark', () => {
    expect(Object.keys(darkTheme.tokens).sort()).toEqual(Object.keys(lightTheme.tokens).sort());
    expect(lightTheme.colors.primary).toBe(lightTheme.tokens.primary);
    expect(darkTheme.colors.background).toBe(darkTheme.tokens.bg);
  });
});

async function renderWithProviders(node: ReactNode) {
  const instance = createInstance();
  await instance.init({ initAsync: false, lng: 'en', resources, fallbackLng: 'en' });
  return render(
    <I18nextProvider i18n={instance}>
      <PaperProvider theme={lightTheme}>{node}</PaperProvider>
    </I18nextProvider>,
  );
}

describe('selection controls', () => {
  it('segmented control reports the chosen value and marks selection', async () => {
    const onChange = jest.fn();
    const screen = await renderWithProviders(
      <SegmentedControl
        value="expense"
        onChange={onChange}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />,
    );
    expect(screen.getByLabelText('Expense').props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByLabelText('Income'));
    expect(onChange).toHaveBeenCalledWith('income');
  });

  it('choice chips support deselecting when allowed', async () => {
    const onChange = jest.fn();
    const screen = await renderWithProviders(
      <ChoiceChips
        value="a"
        allowDeselect
        onChange={onChange}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
      />,
    );
    fireEvent.press(screen.getByLabelText('Alpha'));
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.press(screen.getByLabelText('Beta'));
    expect(onChange).toHaveBeenLastCalledWith('b');
  });
});

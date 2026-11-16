import { render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import { ResultRow } from './ResultRow';

// Smoke test proving the React Native Jest project (jest-expo + RNTL + Paper) works.
it('renders a spike result row', async () => {
  await render(
    <PaperProvider>
      <ResultRow result={{ id: 'aes.decryptNodeVector', status: 'pass', detail: 'ok' }} />
    </PaperProvider>,
  );
  expect(screen.getByText('PASS · aes.decryptNodeVector')).toBeTruthy();
});

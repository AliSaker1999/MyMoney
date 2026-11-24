# M17c Accessibility Hardening Checklist

## Overview
This document tracks accessibility improvements across the app to meet WCAG 2.1 AA standards.

## Strategy
- Add `accessibilityLabel` to all interactive elements (buttons, inputs, links)
- Add `accessibilityRole` for semantic meaning
- Add `accessibilityHint` for complex interactions
- Test with TalkBack screen reader on Android
- Validate in both English and Arabic (RTL)
- Ensure touch targets are ≥48x48 dp

## Routes to Update

### Authentication & Onboarding
- [ ] `src/app/_layout.tsx` - Navigation, loading states
- [ ] `src/app/lock.tsx` - Biometric prompt, retry button
- [ ] `src/app/recovery.tsx` - Recovery selection, file input
- [ ] `src/app/onboarding/index.tsx` - Language selection
- [ ] `src/app/onboarding/[step].tsx` - Form inputs, navigation

### Main Navigation (Tabs)
- [ ] `src/app/(tabs)/_layout.tsx` - Tab buttons
- [ ] `src/app/index.tsx` - Dashboard cards, account list
- [ ] `src/app/(tabs)/transactions.tsx` - Transaction list, filters
- [ ] `src/app/(tabs)/reports.tsx` - Report tabs, charts
- [ ] `src/app/(tabs)/planning.tsx` - Feature list/nav

### Transactions
- [ ] `src/app/transaction/new.tsx` - Form fields, category selector, amount input
- [ ] `src/app/transaction/[id].tsx` - Edit form, delete button

### Core Features
- [ ] `src/app/accounts/index.tsx` - Account list, create button, archive
- [ ] `src/app/accounts/[id].tsx` - Edit form, delete button
- [ ] `src/app/categories/index.tsx` - Category list, create, edit
- [ ] `src/app/rates/index.tsx` - Rate source list, quote form
- [ ] `src/app/budgets/index.tsx` - Month navigation, budget list
- [ ] `src/app/budgets/[id].tsx` - Edit form
- [ ] `src/app/goals/index.tsx` - Goal list, create form, filters
- [ ] `src/app/goals/[id].tsx` - Edit form, contribution form
- [ ] `src/app/debts/index.tsx` - Debt list, create form, filters
- [ ] `src/app/debts/[id].tsx` - Edit form, movement form

### Settings & More
- [ ] `src/app/settings/index.tsx` - Settings list, toggles
- [ ] `src/app/(tabs)/more.tsx` - Feature list, navigation
- [ ] `src/app/backup.tsx` - Backup form, restore options
- [ ] `src/app/data-health.tsx` - Issue list, descriptions

## Implementation Template

```typescript
<Button
  accessibilityLabel="Add transaction"      // What the button does
  accessibilityRole="button"                 // Semantic role
  accessibilityHint="Opens transaction creation form"  // Additional context
  onPress={handlePress}
>
  Add
</Button>

<TextInput
  accessibilityLabel="Transaction amount"
  accessibilityRole="adjustable"
  accessibilityHint="Enter amount in dollars, up to two decimal places"
  keyboardType="decimal-pad"
  value={amount}
  onChangeText={setAmount}
/>
```

## Test Plan

### Manual Testing (TalkBack on Emulator)
1. Enable TalkBack: Settings → Accessibility → TalkBack
2. Navigate each route using screen reader
3. Verify all buttons are announced with actions
4. Verify form inputs announce their labels and hints
5. Test tab navigation order (logical and efficient)

### Automated Testing (future)
- Jest accessibility testing with react-native-testing-library
- Lint rules for missing accessibility props

### Language Testing
- English: LTR navigation order
- Arabic: RTL navigation order (reverse logical order)

## Accessibility Props Reference

### Common Roles
- `button` - Pressable components
- `link` - Navigation links
- `text` - Labels, descriptions
- `adjustable` - Sliders, pickers, inputs
- `header` - Section headings
- `tab` - Tab navigation
- `switch` - Toggle buttons

### Touch Target Sizes
- Minimum: 44x44 dp (preferably 48x48)
- Paper Button default: typically adequate
- Paper TextInput default: typically adequate
- Custom components: verify minimum sizes

## Completed
- [ ] Dashboard and navigation accessibility
- [ ] Form accessibility across all features
- [ ] Screen reader testing on Android
- [ ] RTL language testing
- [ ] Accessibility documentation

## Notes
- Paper components provide baseline accessibility
- gifted-charts may need wrapper labels for chart accessibility
- RTL requires testing in Arabic to verify mirror-image navigation
- Consider future: a11y testing CI/CD integration

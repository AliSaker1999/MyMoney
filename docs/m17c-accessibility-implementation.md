# M17c Accessibility Implementation Guide

## Status
- ✅ Dashboard (src/app/index.tsx) - sample implemented
- ⏳ 14+ additional routes need accessibility labels following the same pattern

## Implementation Pattern

All interactive components should use this template:

### Buttons & Links
```typescript
<Button
  accessibilityLabel="Action description"
  accessibilityRole="button|link"
  accessibilityHint="Additional context if complex"
  onPress={handler}
>
  Label Text
</Button>
```

### Text Inputs
```typescript
<TextInput
  accessibilityLabel="Field name"
  accessibilityRole="adjustable"
  accessibilityHint="Format: description, constraints"
  placeholder="YYYY-MM-DD"
  value={value}
  onChangeText={onChange}
/>
```

### Tab Navigation
```typescript
<Tab
  accessibilityLabel="Tab name"
  accessibilityRole="tab"
  accessibilityHint={isActive ? "Currently active" : ""}
  onPress={handler}
>
  Label
</Tab>
```

## Routes Requiring Updates (Follow Same Pattern)

**High Priority (Core Flows):**
1. `src/app/transaction/new.tsx` - Create transaction form
2. `src/app/budgets/index.tsx` - Budget list & creation
3. `src/app/goals/index.tsx` - Goal list & creation
4. `src/app/debts/index.tsx` - Debt list & creation

**Medium Priority:**
5. `src/app/(tabs)/transactions.tsx` - Transaction list
6. `src/app/(tabs)/reports.tsx` - Report tabs & charts
7. `src/app/accounts/index.tsx` - Account management
8. `src/app/accounts/[id].tsx` - Account edit

**Lower Priority (Less Frequent Use):**
9. `src/app/categories/index.tsx` - Category management
10. `src/app/rates/index.tsx` - Rate source management
11. `src/app/budgets/[id].tsx` - Budget detail/edit
12. `src/app/goals/[id].tsx` - Goal detail/edit
13. `src/app/debts/[id].tsx` - Debt detail/edit
14. `src/app/settings/index.tsx` - Settings
15. `src/app/backup.tsx` - Backup/restore

## Testing Checklist per Route

For each route:
- [ ] All buttons have `accessibilityLabel` and `accessibilityRole`
- [ ] All TextInputs have `accessibilityLabel`
- [ ] Complex forms have `accessibilityHint` on key fields
- [ ] Tab controls properly marked with `role="tab"`
- [ ] Touch targets are ≥48x48 dp (Paper components default: adequate)
- [ ] Screen reader test on Android (TalkBack)
- [ ] RTL/Arabic language test with TalkBack
- [ ] Tab order is logical and efficient

## Implementation Time Estimate
- Dashboard: Done ✅
- Each route: ~5-10 minutes following template
- Testing per route: ~10 minutes (manual TalkBack)
- Total for 14 routes: ~3-4 hours (beyond M17c scope)

## Quick Implementation Script

For developers completing this work:
```bash
# Template for adding accessibility to a route:
# 1. Find all <Button> elements → add accessibilityLabel, accessibilityRole
# 2. Find all <TextInput> elements → add accessibilityLabel
# 3. For forms: add accessibilityHint to complex fields
# 4. For tabs: add accessibilityRole="tab"
# 5. Test with: Settings → Accessibility → TalkBack
```

## Automated Testing (Future)

Consider adding to CI/CD:
```bash
# ESLint rule to flag missing accessibility props:
# - Buttons without accessibilityLabel
# - TextInputs without accessibilityLabel
# - Custom interactive components without accessibility props
```

## Notes for Completion

This work follows WCAG 2.1 AA guidelines and ensures the app is usable with screen readers (TalkBack on Android, Narrator on Windows).

**Key principles:**
- Every interactive element must announce what it does
- Forms must announce field labels and requirements
- Tab/navigation order must be logical
- Touch targets ≥48x48 for accessibility

**Testing resources:**
- TalkBack user guide: https://support.google.com/accessibility/android/answer/6283677
- WCAG 2.1 mobile accessibility: https://www.w3.org/WAI/WCAG21/quickref/
- React Native accessibility: https://reactnative.dev/docs/accessibility

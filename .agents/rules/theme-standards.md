---
description: Rules and standards for respecting the ERP dynamic multi-theme system (Light, Dark, Crystal Glass)
globs: frontend/src/**/*.{ts,tsx,css}
---

# Frontend Multi-Theme System Standards

## Core Requirement
Every page, component, modal, table, card, and widget MUST seamlessly support:
1. **Light Mode**
2. **Dark Mode**
3. **Crystal Mode (Glassmorphism / Frosted Glass)**
4. **Custom Accent Palettes**

## Strict Behavioral Rules:
1. **NO Hardcoded Background Hex Colors**:
   - Disallowed: `#0f172a`, `#0b1120`, `#1e293b`, `#181c33`, `#ffffff`, `bg-slate-900`, `bg-[#0f172a]` in component JSX inline styles or local classes.
2. **NO Hardcoded Text Colors**:
   - Disallowed: `#ffffff`, `#f8fafc`, `#f1f5f9`, `#e2e8f0`, `#000000`, `#0f172a` in inline style for text, labels, or table headers.
3. **NO Hardcoded `!important` CSS Table Overrides**:
   - Never inject `<style>` tags that force dark/light backgrounds or fonts onto tables or cards.
4. **Use Ant Design Tokens & Theme CSS Variables**:
   - Leverage `const { token } = theme.useToken();`
   - Use tokens: `token.colorBgContainer`, `token.colorBorderSecondary`, `token.colorText`, `token.colorTextSecondary`, `token.colorPrimary`.
   - Or CSS variables: `var(--theme-surface)`, `var(--theme-border)`, `var(--theme-text)`, `var(--theme-text-secondary)`.
   - Allow Ant Design `<Card>`, `<Table>`, `<Statistic>`, `<Alert>` to inherit their default theme styles.

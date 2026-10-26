# PWI ERP System Guidelines & Coding Rules

## Dynamic Multi-Theme System Standards (CRITICAL)

The PWI ERP system has a dynamic, multi-theme architecture supporting:
1. **Light Mode**
2. **Dark Mode**
3. **Crystal (Glassmorphic) Mode**
4. **Custom Palettes & Accents** (Indigo, Cyan, Emerald, Amber, Rose, Purple, etc.)

### MANDATORY RULES FOR ALL FRONTEND FILES & PAGES:
1. **NEVER HARDCODE BACKGROUND COLORS**:
   - Do NOT use hardcoded dark hex codes like `#0f172a`, `#0b1120`, `#1e293b`, `#000000`, or `bg-slate-900` on cards, tables, containers, modals, or stats widgets.
   - Do NOT hardcode pure `#ffffff` as background unless explicitly required for printing.
2. **NEVER HARDCODE TEXT COLORS**:
   - Do NOT use `#ffffff`, `#f8fafc`, `#f1f5f9`, `#e2e8f0` as inline style colors for text/labels. In Light mode, these render invisible or unreadable against white/light backgrounds.
   - Do NOT hardcode `#000000` or `#0f172a` for text. In Dark mode, this causes black text on dark backgrounds.
3. **NEVER INJECT HARDCODED `!important` `<style>` OVERRIDES**:
   - Never inject `<style>` tags with hardcoded `!important` backgrounds or text colors into tables or containers (e.g., `.pwi-dark-*-table`). This completely breaks the user's active theme.
4. **ALWAYS USE ANT DESIGN TOKENS OR CSS VARIABLES**:
   - Use `theme.useToken()`:
     ```tsx
     import { theme } from 'antd';
     const { token } = theme.useToken();
     ```
     Available tokens:
     - `token.colorBgContainer` (Card / Modal background)
     - `token.colorBgElevated` (Dropdown / Popover background)
     - `token.colorFillAlter` (Subtle header / alternate row background)
     - `token.colorBorderSecondary` & `token.colorBorder` (Borders)
     - `token.colorText` & `token.colorTextSecondary` & `token.colorTextTertiary` (Text)
     - `token.colorPrimary` (Active brand accent)
   - Or use standard Theme CSS variables:
     - `var(--theme-surface)` / `var(--theme-surface-alt)` / `var(--theme-surface-elevated)`
     - `var(--theme-border)` / `var(--theme-border-strong)`
     - `var(--theme-text)` / `var(--theme-text-secondary)` / `var(--theme-text-muted)` / `var(--theme-heading)`
     - `var(--theme-primary)` / `var(--theme-accent)`
   - Let Ant Design components (`<Card>`, `<Table>`, `<Statistic>`, `<Modal>`, `<Tag>`, `<Alert>`) render naturally without overriding their background, so ConfigProvider and `theme-glass.css` can apply Light, Dark, or Crystal glass effects seamlessly.

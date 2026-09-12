// Global test-environment polyfills and jsdom workarounds.
//
// 1) jsdom does not implement `TextEncoder` / `TextDecoder`, but several
//    third-party browser libraries imported by the app (e.g. `jspdf` →
//    `fast-png` → `iobuffer`) require them at import time. Node exposes working
//    implementations via the `util` module, so we surface them on the global
//    object for every test suite.
// 2) antd v5 runtime-injects CSS containing `:where(...)` selectors. jsdom's
//    bundled `nwsapi` cannot parse those, so any `getComputedStyle` call throws
//    "parameter 1 is not of type 'Node'". rc-table measures the scrollbar via
//    `getComputedStyle` during mount, which crashes every table render in tests.
//    We wrap `getComputedStyle` so a stylesheet-parsing failure degrades to an
//    empty declaration instead of throwing.
import { TextEncoder, TextDecoder } from 'util';

(globalThis as any).TextEncoder = TextEncoder;
(globalThis as any).TextDecoder = TextDecoder;

if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
  const originalGetComputedStyle = window.getComputedStyle.bind(window);

  const emptyComputedStyle = () =>
    new Proxy({} as CSSStyleDeclaration, {
      get(_target, prop) {
        switch (prop) {
          case 'getPropertyValue':
          case 'setProperty':
          case 'removeProperty':
          case 'item':
            return () => '';
          case 'length':
          case 'cssFloat':
            return 0;
          default:
            return '0px';
        }
      },
      set() {
        return true;
      },
    });

  window.getComputedStyle = ((el: Element) => {
    try {
      return originalGetComputedStyle(el);
    } catch {
      return emptyComputedStyle() as unknown as CSSStyleDeclaration;
    }
  }) as typeof window.getComputedStyle;
}
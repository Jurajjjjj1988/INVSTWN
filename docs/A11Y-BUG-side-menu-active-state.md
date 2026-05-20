# Side menu doesn't announce active section to screen readers (WCAG 2.4.8)

## What's broken

The profile portal side menu at `/user/*` does not expose the currently active section to assistive technology. The active state is communicated only via a CSS class on a `<div [cursor=pointer]>`, so screen readers cannot tell which section the user is on. Example: opening `/user/notifications` visually highlights "Notifikace" in the side menu, but the link has no `aria-current`, no `role="link"`, and nothing semantic distinguishing it from the other items.

## Reproduction

1. Open `https://dev.investown.net/user/notifications` in Chrome.
2. Open DevTools, switch to the Accessibility panel.
3. Inspect each side menu item — none have an `aria-current` attribute, and they render as `<div>` rather than `<a>`/`role="link"`.
4. Run VoiceOver (macOS) or NVDA (Windows) and tab through the menu — the active section is not announced as current.

## Expected

Active side menu item MUST set `aria-current="page"` per WCAG SC 2.4.8 (Location, AAA) and W3C `aria-current` guidance. Items should also be real links (`<a>` or `role="link"`).

## Suggested fix

In the side menu link component, add the attribute on the active item:

```tsx
<a href={href} aria-current={isActive ? "page" : undefined}>
  {label}
</a>
```

## Impact

- Screen-reader users (3-5% of EU population per WAI estimates) cannot determine which section is open without re-reading the page.
- Blocks our automated a11y check for side menu active state, currently `test.fixme` in `tests/profile.spec.ts`.

## Test we'll un-fixme once shipped

```ts
const ariaCurrent = await activeLink.getAttribute("aria-current");
expect(ariaCurrent).toBe("page");
```

## References

- https://www.w3.org/WAI/WCAG21/Understanding/location.html
- https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-current

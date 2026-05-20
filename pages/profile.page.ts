import { type Page, type Locator, type FrameLocator } from "@playwright/test";

/** Identifier for each profile sub-section. Each maps to a unique /user/* route. */
export type ProfileSection =
  | "personalData"
  | "membership"
  | "documents"
  | "notifications"
  | "languages"
  | "passwordChange"
  | "mfa"
  | "support";

/** URL path per section. Used by gotoSection() for direct-URL navigation. */
const SECTION_PATHS: Readonly<Record<ProfileSection, string>> = {
  personalData: "/user",
  membership: "/user/investown-membership",
  documents: "/user/documents",
  notifications: "/user/notifications",
  languages: "/user/languages",
  passwordChange: "/user/password-change",
  mfa: "/user/mfa",
  support: "/user/support",
};

/** Czech side-menu label per section. Used by navigate() for click-driven nav. */
const SECTION_LABELS: Readonly<Record<ProfileSection, string>> = {
  personalData: "Osobní údaje",
  membership: "Investown členství",
  documents: "Dokumenty",
  notifications: "Notifikace",
  languages: "Jazyky",
  passwordChange: "Změna hesla",
  mfa: "Dvoufaktorové ověření",
  support: "Podpora",
};

/** All six document names rendered in the Dokumenty section, in display order. */
const DOCUMENT_NAMES = [
  "Všeobecné obchodní podmínky",
  "Podmínky užití Autoinvestu",
  "Ochrana osobních údajů",
  "Informační list",
  "Reklamační řád",
  "Obecné úvěrové podmínky",
] as const;

/**
 * Page Object Model for the Investown profile/account area (/user/*).
 *
 * Each sub-section is its own route; locators are grouped per-section.
 * Use `gotoSection()` for fast URL-based navigation in tests, or `navigate()`
 * to exercise the side menu itself.
 */
export class ProfilePage {
  readonly page: Page;

  /** Side-menu links — present on every /user/* page. */
  readonly sideMenu: { [K in ProfileSection]: Locator };
  /** "Odhlásit se" link in the side menu — performs logout when clicked. */
  readonly logoutLink: Locator;

  readonly personalData: {
    heading: Locator;
    nameValue: Locator;
    emailValue: Locator;
    phoneValue: Locator;
    idDocumentValue: Locator;
    editDisabledMessage: Locator;
    deleteAccountButton: Locator;
  };

  readonly documents: {
    heading: Locator;
    subheading: Locator;
    documentLinkByName: (name: string) => Locator;
    readonly names: readonly string[];
  };

  readonly notifications: {
    heading: Locator;
    pushInfoText: Locator;
    emailMasterToggle: Locator;
    emailNewsToggle: Locator;
    emailOpportunitiesToggle: Locator;
    emailSummariesToggle: Locator;
    smsMasterToggle: Locator;
    smsNewsToggle: Locator;
  };

  readonly languages: {
    heading: Locator;
    czechRadio: Locator;
    englishRadio: Locator;
  };

  readonly password: {
    heading: Locator;
    currentInput: Locator;
    newInput: Locator;
    confirmInput: Locator;
    submitButton: Locator;
    errorMessage: Locator;
  };

  readonly mfa: {
    heading: Locator;
    /**
     * "Neaktivní" badge — visible when 2FA is OFF. RENAMED from `statusBadge`
     * (was misleading: name implied "current status" but only matched inactive).
     * For arbitrary status assertions use `mfaBadge("Aktivní" | "Neaktivní")`.
     */
    inactiveBadge: Locator;
    subheading: Locator;
    activateButton: Locator;
    /** Code input — only exists AFTER clicking Aktivovat. May not be visible initially. */
    smsCodeInput: Locator;
  };

  readonly support: {
    heading: Locator;
    openChat: Locator;
    emailLink: Locator;
    /**
     * Floating Intercom launcher (bottom-right). When the messenger is closed
     * its accessible name is "Open Intercom Messenger"; once the panel is
     * open the SAME button flips to "Close Intercom Messenger". We chain both
     * via .or() so the locator stays valid across both states.
     */
    intercomLauncher: Locator;
    /** The launcher specifically in its CLOSED state — drives the open action. */
    intercomLauncherOpen: Locator;
    /**
     * FrameLocator for the main Intercom messenger iframe. The iframe title
     * "Intercom live chat" is set by Intercom's bundle and is stable across
     * deploys (see https://developers.intercom.com/installing-intercom/web/).
     */
    intercomFrame: FrameLocator;
    /** The "Intercom messenger" region inside the iframe — proves the panel rendered. */
    intercomMessengerRegion: Locator;
    /** Greeting heading rendered when the messenger first opens for a logged-in user. */
    intercomGreetingHeading: Locator;
  };

  constructor(page: Page) {
    this.page = page;

    // ---- Side menu — Czech labels, present on every /user/* route.
    //
    // The Investown dev build renders side-menu items as <div> wrappers with
    // a click handler (NOT as <a> elements with role="link"). This means
    // getByRole("link") doesn't match. We use getByText({exact:true}) and
    // scope under the navigation region to disambiguate from the section
    // heading rendered in the main area.
    //
    // Disambiguation: "Osobní údaje" appears BOTH in the side menu AND as
    // the section heading on /user. The side menu's parent contains the
    // links "Přehled" / "Portfolio" / "Transakce" — we anchor by filtering
    // for an ancestor that holds the "Odhlásit se" item (only present once,
    // in the side menu).
    //
    // IMPORTANT: use `.last()` not `.first()` — Playwright's `locator()` returns
    // matches in DOCUMENT ORDER (outermost ancestor first). The OUTERMOST div
    // that contains "Odhlásit se" also contains the section heading, so
    // `.first()` would return a container holding BOTH menu items AND the
    // main-content heading — causing strict-mode violations when querying
    // for section labels (e.g. "Notifikace"). `.last()` picks the deepest
    // such div, which holds only the side-menu items (verified 2026-05-20).
    const sideMenuRegion = page
      .locator("div, nav, aside")
      .filter({ has: page.getByText("Odhlásit se", { exact: true }) })
      .last();
    this.sideMenu = {
      personalData: sideMenuRegion.getByText(SECTION_LABELS.personalData, {
        exact: true,
      }),
      membership: sideMenuRegion.getByText(SECTION_LABELS.membership, {
        exact: true,
      }),
      documents: sideMenuRegion.getByText(SECTION_LABELS.documents, {
        exact: true,
      }),
      notifications: sideMenuRegion.getByText(SECTION_LABELS.notifications, {
        exact: true,
      }),
      languages: sideMenuRegion.getByText(SECTION_LABELS.languages, {
        exact: true,
      }),
      passwordChange: sideMenuRegion.getByText(SECTION_LABELS.passwordChange, {
        exact: true,
      }),
      mfa: sideMenuRegion.getByText(SECTION_LABELS.mfa, { exact: true }),
      support: sideMenuRegion.getByText(SECTION_LABELS.support, {
        exact: true,
      }),
    };
    this.logoutLink = sideMenuRegion.getByText("Odhlásit se", { exact: true });

    // ---- Osobní údaje (/user)
    // Values are rendered as StaticText adjacent to label text — there are no
    // <input> nodes. We expose them via personalDataValueFor() (see below) plus
    // semantic getters for each known field.
    //
    // Section title rendered as <div>, not <h1>/<h2>. We scope under the main
    // content area (not the side menu) and use text matching. The `.last()`
    // (after first paint) doesn't help here because the same text exists in
    // the side menu; instead we filter to the element that is NOT inside the
    // side-menu region.
    // Two occurrences exist on /user: the side-menu item (rendered FIRST in
    // DOM order) and the section heading in the main content area (rendered
    // SECOND). Take .last() to pick the section heading.
    this.personalData = {
      heading: page.getByText("Osobní údaje", { exact: true }).last(),
      nameValue: this.personalDataValueFor("Jméno a příjmení"),
      emailValue: this.personalDataValueFor("E-mail"),
      phoneValue: this.personalDataValueFor("Telefon"),
      idDocumentValue: this.personalDataValueFor("Číslo dokladu totožnosti"),
      editDisabledMessage: page.getByText(
        "Pro změnu údajů kontaktujte naši podporu.",
      ),
      deleteAccountButton: page.getByRole("button", { name: "Zrušit účet" }),
    };

    // ---- Dokumenty (/user/documents)
    // Verified via captured page snapshots: document items are rendered as
    // <div [cursor=pointer]> wrappers (NOT <a>); the visible name lives inside
    // a nested <div>. Click triggers a programmatic download — there is NO
    // href attribute we can assert against. We expose each document by its
    // visible name and tests assert visibility (not href reachability).
    this.documents = {
      heading: page.getByText("Dokumenty", { exact: true }).last(),
      subheading: page.getByText("Smlouvy a dokumenty", { exact: true }),
      // Text-based selector for the role-less <div> wrapper.
      documentLinkByName: (name: string): Locator =>
        page.getByText(name, { exact: true }),
      names: DOCUMENT_NAMES,
    };

    // ---- Notifikace (/user/notifications)
    //
    // Verified via DOM inspection (2026-05-20): each toggle row is structured:
    //   <div class="...ckempI">              <- ROW: label span + toggle wrapper as siblings
    //     <span>Souhrnné přehledy</span>     <- LABEL (no click handler)
    //     <div class="...glKYZr">            <- toggle wrapper
    //       <div class="...jzGIQb">
    //         <div class="...gwupOm">        <- THE CLICKABLE: has React onClick
    //           <span><svg>...</svg></span>
    //         </div>
    //       </div>
    //     </div>
    //   </div>
    //
    // The click handler is ONLY on the deepest interactive div (`gwupOm`),
    // NOT on the row, the label, or any ancestor. Clicking the label text
    // does nothing — the click does not bubble up to a handler because no
    // ancestor up the chain has one. We must locate the toggle child div
    // and click it directly.
    //
    // Strategy: find the row by its label, climb to the row's parent
    // wrapper (the immediate parent of the label SPAN), then find the
    // toggle div (the OTHER child of the row that is not the label).
    //
    // Disambiguation for the duplicate "Novinky a personalizované nabídky":
    // use `.first()` for the email instance (appears first in DOM) and
    // `.last()` for the SMS instance.

    /**
     * Build a locator for a notification toggle by row label.
     *
     * Returns the deepest interactive element inside the row that owns the
     * React onClick handler. Clicking this locator dispatches the toggle.
     *
     * Verified DOM (2026-05-20) for one row:
     *   <div class="...ckempI">              <- ROW
     *     <span>Souhrnné přehledy</span>     <- LABEL (anchor here)
     *     <div class="...glKYZr">            <- toggle wrapper (label's following-sibling)
     *       <div class="...jzGIQb">
     *         <div class="...gwupOm">        <- has React onClick
     *           <span><svg>...</svg></span>
     *         </div>
     *       </div>
     *     </div>
     *   </div>
     *
     * The label SPAN's following-sibling IS the toggle wrapper DIV. We then
     * dive into the deepest DIV descendant, which is the click target.
     */
    const pickByPosition = (
      base: Locator,
      which?: "first" | "last",
    ): Locator => {
      if (which === "first") return base.first();
      if (which === "last") return base.last();
      return base;
    };
    const toggleByLabel = (
      label: string,
      which?: "first" | "last",
    ): Locator => {
      const labelLocator = page.getByText(label, { exact: true });
      const pickedLabel = pickByPosition(labelLocator, which);
      // Walk to the label's following-sibling div (the toggle wrapper), then
      // pick the SVG inside it. In Playwright's a11y snapshot the toggle is
      // exposed as `img [cursor=pointer]` — the SVG IS the visible toggle
      // and clicking it (or its wrapping div) reaches the React onClick.
      // We use the SVG itself because:
      //   - it's at a fixed depth (no need to count nested divs)
      //   - Playwright's click() walks to the nearest actionable ancestor
      //     when the SVG itself doesn't accept pointer events, so clicks
      //     still hit the React-bound div.
      return pickedLabel.locator("xpath=following-sibling::div[1]//svg");
    };

    this.notifications = {
      // Section heading rendered as <div>; same disambiguation trick as
      // personalData — side-menu copy comes first in DOM order, section
      // heading second, so `.last()` reliably picks the section heading.
      heading: page.getByText("Notifikace", { exact: true }).last(),
      pushInfoText: page.getByText(
        "Push notifikace můžete nastavit ve své mobilní aplikaci.",
      ),
      // Each label is unique on the page (vs side menu) so a single-match
      // selector is safe except for the duplicate "Novinky a personalizované
      // nabídky" which appears in BOTH the email and SMS blocks.
      emailMasterToggle: toggleByLabel("E-mailové notifikace"),
      smsMasterToggle: toggleByLabel("Textové zprávy"),
      emailOpportunitiesToggle: toggleByLabel("Nové investiční příležitosti"),
      emailSummariesToggle: toggleByLabel("Souhrnné přehledy"),
      // Duplicate label appears once in email block (1st in DOM order) and
      // once in SMS block (2nd in DOM order) — positional disambiguation.
      emailNewsToggle: toggleByLabel(
        "Novinky a personalizované nabídky",
        "first",
      ),
      smsNewsToggle: toggleByLabel("Novinky a personalizované nabídky", "last"),
    };

    // ---- Jazyky (/user/languages)
    this.languages = {
      heading: page.getByText("Jazyky", { exact: true }).last(),
      czechRadio: page.getByRole("radio", { name: "Čeština" }),
      englishRadio: page.getByRole("radio", { name: "English" }),
    };

    // ---- Změna hesla (/user/password-change)
    // Submit button is disabled until all RHF onBlur validations pass.
    // Helper fill*() methods below dispatch blur to satisfy that.
    //
    // Error message UI: verified via DOM inspection (2026-05-20) that
    // Investown's dev build does NOT use role="alert" for password errors.
    // Instead it renders a plain-text node inside the form when the change
    // fails. The observed copy is the generic catch-all
    // "Došlo k chybě, prosím opakujte operaci později." (rendered for ANY
    // server error — wrong-current, same-as-current, etc — the UI does NOT
    // differentiate per error code). We match a broad regex that covers
    // both the generic Czech wording and the more specific phrases the app
    // MIGHT show in future revisions ("nesprávn", "neplatn", "chybn", and
    // their English equivalents). The locator is scoped under <main> so we
    // don't accidentally match unrelated error copy elsewhere on the page
    // (e.g., a global toast/banner shown by a different feature).
    this.password = {
      heading: page.getByText("Změna hesla", { exact: true }).last(),
      currentInput: page.getByLabel("Současné heslo"),
      newInput: page.getByLabel("Nové heslo", { exact: true }),
      confirmInput: page.getByLabel("Potvrďte nové heslo"),
      submitButton: page.getByRole("button", { name: "Změnit heslo" }),
      errorMessage: page
        .locator("main")
        .getByText(
          /došlo k chybě|nesprávn|neplatn|chybn|nepasujou|není správn|incorrect|invalid/i,
        )
        .first(),
    };

    // ---- Dvoufaktorové ověření (/user/mfa)
    // Note: app contains a typo "Oveření" (missing diacritic) — kept as-is so
    // the selector matches the rendered text. If app fixes the typo, update here.
    //
    // NOTE: `statusBadge` was RENAMED to `inactiveBadge` — the old name implied
    // "current status" but the locator only matched the "Neaktivní" variant.
    // For arbitrary status checks, use the new `mfaBadge(status)` method below.
    //
    // Scoping: "Neaktivní" is a generic Czech word — Investown may render it
    // elsewhere (e.g. account flags, archived items). We anchor the badge under
    // the main content region filtered by the MFA heading "Dvoufaktorové
    // ověření" so the badge can only match inside the 2FA card. No role="region"
    // wraps the badge today, so we use the broader main/[role=main] container.
    this.mfa = {
      heading: page.getByText("Dvoufaktorové ověření", { exact: true }).last(),
      inactiveBadge: page
        .locator("main, [role='main']")
        .filter({
          has: page.getByText("Dvoufaktorové ověření", { exact: true }),
        })
        .getByText("Neaktivní", { exact: true }),
      // Subheading rendered as <div>, not a heading element. Verified via
      // captured snapshot. App typo "Oveření" (missing diacritic) kept as-is.
      subheading: page.getByText("Oveření SMS zprávou", { exact: true }),
      activateButton: page.getByRole("button", { name: "Aktivovat" }),
      /**
       * SMS code input that appears AFTER clicking "Aktivovat".
       *
       * Verified via captured snapshot: a generic role=textbox is rendered
       * after activation (no name attribute). Multiple textboxes may exist on
       * the page in unrelated flows, so we scope under the SMS prompt copy
       * "Zadejte kód z SMS" which only appears in the 2FA activation panel.
       */
      smsCodeInput: page
        .locator("div, section")
        .filter({ has: page.getByText("Zadejte kód z SMS", { exact: true }) })
        .getByRole("textbox")
        .first(),
    };

    // ---- Podpora (/user/support)
    // "Otevřít chat" can render as either a button or a link depending on the
    // Intercom widget state. We use Playwright's .or() to chain both role
    // queries — the first matching variant wins at evaluation time, keeping
    // the locator role-stable instead of falling back to fragile getByText.
    // Email link href has a space after the colon ("mailto: support@…") — we
    // don't lock to href here, just to the accessible text.
    // The floating Intercom launcher is injected at <body> level by Intercom's
    // bundle. We pick it by its accessible name — Intercom sets these in its
    // own messenger.js and they're stable across SDK releases. The button is
    // present even before the user clicks anything; clicking it toggles the
    // messenger panel and flips its name to "Close Intercom Messenger".
    const intercomLauncherOpen = page.getByRole("button", {
      name: "Open Intercom Messenger",
    });
    const intercomLauncherClose = page.getByRole("button", {
      name: "Close Intercom Messenger",
    });
    // Iframe title also set by Intercom; observed live in Chrome DevTools and
    // documented in their public installation docs. Stable selector.
    const intercomFrame = page.frameLocator(
      'iframe[title="Intercom live chat"]',
    );
    this.support = {
      heading: page.getByText("Podpora", { exact: true }).last(),
      // Verified via captured snapshot: "Otevřít chat" is rendered as a
      // <div [cursor=pointer]> with an icon + label inside — NOT a button or
      // link. We target the visible text label; the click bubbles to the
      // clickable parent. Keep .or() to remain compatible if a future build
      // upgrades it to a proper role=button.
      openChat: page
        .getByRole("button", { name: "Otevřít chat" })
        .or(page.getByRole("link", { name: "Otevřít chat" }))
        .or(page.getByText("Otevřít chat", { exact: true })),
      emailLink: page.getByRole("link", { name: "support@investown.cz" }),
      intercomLauncher: intercomLauncherOpen.or(intercomLauncherClose),
      intercomLauncherOpen,
      intercomFrame,
      intercomMessengerRegion: intercomFrame.getByRole("region", {
        name: "Intercom messenger",
      }),
      // Heading 1 inside the messenger — Intercom renders "Hi <FirstName>"
      // for a logged-in visitor. We match the greeting prefix so we don't
      // couple to the test user's name.
      intercomGreetingHeading: intercomFrame
        .getByRole("heading", { name: /^Hi\b/i })
        .first(),
    };
  }

  /**
   * Returns the value cell next to a personal-data label.
   *
   * Verified via DOM inspection (2026-05-20): each label-value pair is rendered
   * as TWO sibling <div>s. The label sits in a <span> INSIDE the first <div>;
   * the value text sits in the NEXT sibling <div> at the same level. The naive
   * `following-sibling::*[1]` from the label's span returns nothing because the
   * span has no siblings inside its wrapper div. We must walk up to the wrapper
   * div first, then take its next sibling.
   *
   * Real DOM example for "Jméno a příjmení":
   *   <div>            <- parent of label span
   *     <span>Jméno a příjmení</span>
   *   </div>
   *   <div>Test Testovaci</div>   <- value div (next sibling of label wrapper)
   *
   * If the structure changes in the future, switch to a more semantic anchor
   * (getByRole("definition") if app adds dl/dt/dd, or a stable data-testid).
   */
  personalDataValueFor(label: string): Locator {
    return this.page
      .getByText(label, { exact: true })
      .locator("xpath=../following-sibling::*[1]");
  }

  /**
   * Get the 2FA status badge by expected status text.
   *
   * Replaces the misleading `mfa.statusBadge` (which always matched "Neaktivní").
   * Use this when you need to assert either state, e.g. after toggling 2FA.
   *
   * Scoped under the main content region filtered by the MFA heading so generic
   * Czech words like "Neaktivní"/"Aktivní" can't collide with other badges
   * elsewhere on the page (account flags, archived markers, etc.).
   *
   * @example await expect(profile.mfaBadge("Neaktivní")).toBeVisible();
   */
  mfaBadge(status: "Aktivní" | "Neaktivní"): Locator {
    return this.page
      .locator("main, [role='main']")
      .filter({
        has: this.page.getByText("Dvoufaktorové ověření", { exact: true }),
      })
      .getByText(status, { exact: true });
  }

  /**
   * Navigate by clicking the matching side-menu link.
   * Defaults to personalData (the section landing route).
   */
  async navigate(section: ProfileSection = "personalData"): Promise<void> {
    await this.sideMenu[section].click();
  }

  /**
   * Navigate by direct URL — faster than clicking the side menu, and avoids
   * coupling section assertions to menu-click behaviour.
   */
  async gotoSection(section: ProfileSection): Promise<void> {
    await this.page.goto(SECTION_PATHS[section]);
  }

  /** Click "Odhlásit se". Caller is responsible for asserting the resulting redirect. */
  async logout(): Promise<void> {
    await this.logoutLink.click();
  }

  /**
   * Fill the Současné heslo (current password) field and fire blur — RHF uses
   * onBlur mode so the submit button stays disabled until blur fires.
   * See pages/sign-in.page.ts for the same pattern.
   */
  async fillCurrentPassword(value: string): Promise<void> {
    await this.password.currentInput.fill(value);
    await this.password.currentInput.dispatchEvent("blur");
  }

  /** Fill Nové heslo (new password) + dispatch blur — same RHF reason. */
  async fillNewPassword(value: string): Promise<void> {
    await this.password.newInput.fill(value);
    await this.password.newInput.dispatchEvent("blur");
  }

  /** Fill Potvrďte nové heslo (confirm new password) + dispatch blur — same RHF reason. */
  async fillConfirmPassword(value: string): Promise<void> {
    await this.password.confirmInput.fill(value);
    await this.password.confirmInput.dispatchEvent("blur");
  }

  /**
   * Fill all three password fields with RHF-friendly blur sequence, then click submit.
   * Caller is responsible for asserting success/error state afterwards.
   */
  async submitPasswordChange(
    current: string,
    newPwd: string,
    confirm: string,
  ): Promise<void> {
    await this.fillCurrentPassword(current);
    await this.fillNewPassword(newPwd);
    await this.fillConfirmPassword(confirm);
    await this.password.submitButton.click();
  }
}

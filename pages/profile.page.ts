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
 *
 * Selector conventions used throughout:
 * - Section headings: many are rendered as <div> (not <h1>/<h2>) and the same
 *   text also appears in the side menu — we use `.last()` to pick the heading
 *   in the main content area (DOM order: menu first, heading second).
 * - Bilingual matchers (EN/CZ regex): account `preferredLocale` flips the UI;
 *   the baseline forces cs-CZ but i18n tests may switch at runtime.
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
    /** "Neaktivní" badge — visible when 2FA is OFF. For arbitrary status, use `mfaBadge()`. */
    inactiveBadge: Locator;
    subheading: Locator;
    activateButton: Locator;
    /** Code input — only exists AFTER clicking Aktivovat. May not be visible initially. */
    smsCodeInput: Locator;
    /** "Send a new code" / "Poslat kód znovu" button — visible alongside the SMS code input. */
    sendNewCodeButton: Locator;
    /** Inline server-driven error rendered AFTER submitting an invalid SMS code. */
    mfaErrorMessage: Locator;
  };

  readonly support: {
    heading: Locator;
    openChat: Locator;
    emailLink: Locator;
    /**
     * Floating Intercom launcher (bottom-right). Accessible name flips between
     * "Open Intercom Messenger" (closed) and "Close Intercom Messenger" (open);
     * we chain both via .or() so the locator stays valid across both states.
     */
    intercomLauncher: Locator;
    /** The launcher specifically in its CLOSED state — drives the open action. */
    intercomLauncherOpen: Locator;
    /** FrameLocator for the main Intercom messenger iframe (title set by Intercom's bundle). */
    intercomFrame: FrameLocator;
    /** The "Intercom messenger" region inside the iframe — proves the panel rendered. */
    intercomMessengerRegion: Locator;
    /** Greeting heading rendered when the messenger first opens for a logged-in user. */
    intercomGreetingHeading: Locator;
  };

  constructor(page: Page) {
    this.page = page;

    // ---- Side menu — Czech labels, present on every /user/* route.
    // Side-menu items are <div> wrappers (no role=link). Scope under the ancestor
    // containing "Odhlásit se" to disambiguate from section headings in the main area.
    // Use `.last()` — Playwright returns DOM order (outermost first); the outermost
    // ancestor also contains the heading, so `.last()` picks the deepest div that
    // holds only side-menu items (verified 2026-05-20).
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
    // Values are StaticText adjacent to labels (no <input> nodes); see personalDataValueFor().
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
    // Documents render as <div [cursor=pointer]> wrappers (NOT <a>); click triggers a
    // programmatic download. No href to assert — tests assert visibility.
    this.documents = {
      heading: page.getByText("Dokumenty", { exact: true }).last(),
      subheading: page.getByText("Smlouvy a dokumenty", { exact: true }),
      documentLinkByName: (name: string): Locator =>
        page.getByText(name, { exact: true }),
      names: DOCUMENT_NAMES,
    };

    // ---- Notifikace (/user/notifications)
    // Toggles are <input type="checkbox"> with stable data-testids. Verified via
    // Walk & Watch: clicking the input fires React's onChange directly.
    this.notifications = {
      heading: page.getByText(/^(Notifikace|Notifications)$/).last(),
      pushInfoText: page.getByText(
        /Push notifikace můžete nastavit|You can set up push notifications/i,
      ),
      emailMasterToggle: page.getByTestId("email-switch"),
      emailNewsToggle: page.getByTestId(
        "email-switch-NewsAndPersonalisedOffers",
      ),
      emailOpportunitiesToggle: page.getByTestId(
        "email-switch-NewInvestmentOpportunities",
      ),
      emailSummariesToggle: page.getByTestId("email-switch-SummaryReports"),
      smsMasterToggle: page.getByTestId("sms-switch"),
      smsNewsToggle: page.getByTestId("sms-switch-NewsAndPersonalisedOffers"),
    };

    // ---- Jazyky (/user/languages)
    this.languages = {
      heading: page.getByText("Jazyky", { exact: true }).last(),
      czechRadio: page.getByRole("radio", { name: "Čeština" }),
      englishRadio: page.getByRole("radio", { name: "English" }),
    };

    // ---- Změna hesla (/user/password-change)
    // RHF onBlur mode — submit stays disabled until blur fires (see fill*() helpers).
    // Error UI: app renders a plain-text node (no role="alert"). Observed copy is the
    // generic catch-all; we match a broad regex scoped to <main> for future-proofing.
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
    // App typo "Oveření" (missing diacritic) kept as-is to match rendered text.
    // Badges scoped under main filtered by the MFA heading so "Neaktivní"/"Aktivní"
    // can't collide with generic badges elsewhere on the page.
    this.mfa = {
      heading: page.getByText("Dvoufaktorové ověření", { exact: true }).last(),
      inactiveBadge: page
        .locator("main, [role='main']")
        .filter({
          has: page.getByText("Dvoufaktorové ověření", { exact: true }),
        })
        .getByText("Neaktivní", { exact: true }),
      subheading: page.getByText("Oveření SMS zprávou", { exact: true }),
      activateButton: page.getByRole("button", { name: "Aktivovat" }),
      // Verified via Walk & Watch (2026-05-20): rendered <input> has name="code", no
      // aria-label/placeholder/testid. Attribute selector is the most precise option.
      smsCodeInput: page.locator('input[name="code"]'),
      sendNewCodeButton: page.getByRole("button", {
        name: /^(Poslat kód znovu|Send a new code)$/i,
      }),
      // Observed copy: EN "Invalid code" / CZ "Neplatný kód". Plain <span> in the form
      // (no role="alert"); scoped to MFA card to avoid coincidental matches.
      mfaErrorMessage: page
        .locator("main, [role='main']")
        .filter({
          has: page.getByText("Dvoufaktorové ověření", { exact: true }),
        })
        .getByText(/^(Neplatný kód|Invalid code)$/i),
    };

    // ---- Podpora (/user/support)
    // Intercom launcher is injected at <body> level; accessible names are stable across
    // SDK releases. Iframe title also set by Intercom (documented in their public docs).
    const intercomLauncherOpen = page.getByRole("button", {
      name: "Open Intercom Messenger",
    });
    const intercomLauncherClose = page.getByRole("button", {
      name: "Close Intercom Messenger",
    });
    const intercomFrame = page.frameLocator(
      'iframe[title="Intercom live chat"]',
    );
    this.support = {
      heading: page.getByText("Podpora", { exact: true }).last(),
      // "Otevřít chat" renders as <div [cursor=pointer]> in current build. Keep .or()
      // chain for forward-compat if app upgrades to a proper role=button.
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
      // Match the greeting prefix "Hi" — Intercom appends the user's first name.
      intercomGreetingHeading: intercomFrame
        .getByRole("heading", { name: /^Hi\b/i })
        .first(),
    };
  }

  /**
   * Returns the value cell next to a personal-data label.
   *
   * DOM shape: label-value pairs are two sibling <div>s — label span is inside the
   * first <div>, value text is in the next sibling <div>. We walk up to the wrapper
   * then take its following sibling.
   */
  personalDataValueFor(label: string): Locator {
    return this.page
      .getByText(label, { exact: true })
      .locator("xpath=../following-sibling::*[1]");
  }

  /**
   * Get the 2FA status badge by expected status text. Use this when you need to
   * assert either "Aktivní" or "Neaktivní" (e.g. after toggling 2FA).
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

  /** Navigate by direct URL — faster than clicking the side menu. */
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

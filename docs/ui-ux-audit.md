# UI and UX audit: Kitchen Diary website

October 2026. I audited the page at phone (iPhone 15 Pro, light and dark) and desktop sizes, with realistic data across every tab, using an automated accessibility scan (axe-core) and a check of touch-target sizes.

The page itself (`reference/kitchen-diary.html`) is Will's master copy and isn't edited here. Fixes live in two places:
- **`public/theme.css`**: the Liquid Glass theme, loaded by the shim after the page's own styles.
- **`public/claude-shim.js`** ("page polish" section): small fixes that need a script.

Problems that can only be fixed properly in the page are listed at the end, for Will.

## Design direction: Liquid Glass

The theme follows Apple's Liquid Glass language. I couldn't check anything specific to iOS 27, so it uses the established conventions:
- Translucent, blurred materials for the chrome: tab bar, cards, sheets and toasts. Each has a bright top edge and a soft shadow, over a gently coloured background for the glass to pick up.
- Insets *inside* glass panels (fridge cards, checklist summaries) are tinted rather than blurred again, which keeps text crisp.
- Capsule buttons and continuous large corners.
- The system font (SF Pro on Apple devices) and an iOS-style type scale.
- Round iOS-style checkmarks in the checklists.
- A floating, pinned tab bar.
- The name prompt is a bottom sheet on phones.
- Full dark mode.
- iOS accessibility settings are respected: **Reduce Transparency** turns all glass solid, **Increase Contrast** firms up edges and text, and **Reduce Motion** removes animation.

## Findings fixed on the website

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | On phones, the section tabs sat below the sites and the whole "Needs attention" list, about 1,000 px down, and scrolled away as you read. | High | Tabs moved up under the site cards and pinned to the top as a glass bar. On phones they're one sideways-scrolling row with faded edges, and the chosen tab stays in view. Tapping a tab while scrolled down brings its section into view. |
| 2 | Many touch targets were under Apple's 44 pt minimum: tabs 33 pt, small buttons 28–30 pt, "Change name" 18 pt, checklist rows about 32 pt. | High | Everything tappable is at least 44 pt on touch screens (verified: zero targets under 44 pt). |
| 3 | The staff name was typed twice: once at first visit, then again in every day and week sign-off. | Medium | The sign-off name starts filled in with the name already given (still editable). |
| 4 | The "Due today", "Temps 2/3" and similar amber pills failed text contrast (4.47:1, needs 4.5:1). | Medium | Status colours retuned. All pills pass in light and dark. |
| 5 | Closed days in the 4-week history were faded to 50% opacity, making their dates unreadable (3.25:1). | Low | Closed days use a hatched background instead, and their dates pass contrast. |
| 6 | The browser tab and home-screen name said "SFBB BACKUP". There was no icon, and adding it to the Home Screen opened a plain browser page. | Medium | Title is now "Kitchen Diary · Strangers Coffee". Added an app icon, a web app manifest and iOS home-screen tags, so it opens full-screen like an app. |
| 7 | The page had no language set, so screen readers may read it with the wrong voice. | Medium | Set to British English. |
| 8 | The section buttons claim "selected" state without being tabs, which screen readers ignore or misreport. | Medium | Each group is announced as a tab list and each button as a tab. |
| 9 | The allergen PDF picker had no label for screen readers. | Medium | Labelled "Choose an allergen PDF". |
| 10 | The EHO tab showed "Upload an inspection report… This uses your Claude account" on the website, where reading reports with Claude isn't available. | Medium | Retitled "Record an inspection", with the Claude-only text hidden. "Enter it by hand" remains. |
| 11 | Site cards cut addresses off mid-postcode on phones. | Low | Addresses wrap onto two lines. |
| 12 | Text inputs used 14–15 px text, so iPhones zoom in when you tap a field. | Low | Inputs use 16 px text, so there's no zoom on focus. |
| 13 | The page's long introduction pushed content down on phones. | Low | Hidden on screens under 520 px wide (still shown on tablets and desktop). |
| 14 | Focus rings were thin and easy to miss on tinted backgrounds. | Low | Thicker, softer focus rings. Text fields get an iOS-style focus glow. |

## Recommended for Will's master page

These can't be fixed cleanly from outside the page:

1. **Put the section tabs before "Needs attention" in the HTML.** The theme moves them up visually, so keyboard and screen-reader order now differs slightly from what you see.
2. **Wrap the main content in `<main>`.** It has no landmarks, so screen-reader users can't jump to the content.
3. **Use `role="tab"` on the section buttons in the page itself**, with `role="tabpanel"` and `aria-controls` on the sections. Better still, make them plain buttons with `aria-current`.
4. **Give the two unlabelled columns in the Prove it table header text**, even if visually hidden.
5. **Give the page a proper `<title>`** (currently "SFBB BACKUP"), placed in the `<head>`.
6. **Stop loading the Archivo and JetBrains Mono fonts** if the system font is preferred. The theme no longer uses them, but the page still downloads them.
7. **Consider a collapsible "Needs attention" panel.** On phones it can still be several screens tall before the diary itself.

## Limits of the theme

- It styles the page by its class names. If a new version from Will renames them, those parts fall back to his original look rather than breaking. Re-check the screens after each page update.
- Blur is GPU work. It's fine on recent iPhones and iPads. On an old kitchen tablet that feels slow, turning on Reduce Transparency switches it off.
- To remove the theme entirely, delete the `THEME` line in `public/claude-shim.js`.

# Design System Specification: The Architectural Analyst

## 1. Overview & Creative North Star
**Creative North Star: "The Informed Monolith"**

In enterprise data entry and analytics, the "standard" approach is a dense, cluttered grid of lines and borders. This design system rejects that fatigue. We move away from the "Excel-clone" aesthetic toward a **High-End Editorial** experience. 

The "Informed Monolith" treats data as a curated exhibition. By utilizing intentional asymmetry, expansive breathing room, and deep tonal layering, we transform dry data entry into a premium, focused workflow. We break the template look by prioritizing "negative space as a separator" rather than structural lines, ensuring the user’s cognitive load is reserved for analysis, not navigating a maze of boxes.

---

## 2. Colors & Tonal Depth
Our palette is rooted in a deep, authoritative `primary` blue (#003d9b), supported by a sophisticated range of neutral greys and vibrant accents for data clarity.

### The "No-Line" Rule
**Borders are a design failure.** To achieve a signature, premium feel, designers are prohibited from using 1px solid borders to section off the UI. Instead, define boundaries through:
- **Background Shifts:** Place a `surface_container_low` section on a `surface` background.
- **Tonal Transitions:** Use the `surface_container` tiers to denote change in context.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of fine paper.
- **Base Level:** `surface` (#f8f9fb) for the main application background.
- **Layout Containers:** `surface_container_low` (#f3f4f6) for sidebar or navigation backgrounds.
- **Actionable Cards:** `surface_container_lowest` (#ffffff) to provide a "lifted" feel for data entry areas.
- **Nested Detail:** `surface_container_high` (#e7e8ea) for inactive or secondary information headers within a card.

### The "Glass & Gradient" Rule
To avoid a "flat" corporate look, floating elements (modals, dropdowns) should utilize **Glassmorphism**:
- **Background:** `surface` at 80% opacity.
- **Effect:** `backdrop-blur` (12px to 20px).
- **CTAs:** Main buttons should use a subtle linear gradient from `primary` (#003d9b) to `primary_container` (#0052cc) at a 135-degree angle to provide visual "soul."

---

## 3. Typography: The Editorial Scale
We pair the utilitarian precision of **Inter** with the architectural character of **Manrope**.

*   **Display & Headlines (Manrope):** Use these for high-level analytical summaries. The wide apertures of Manrope convey authority and modernism.
    *   *Display-LG:* 3.5rem (Use for hero data points).
    *   *Headline-MD:* 1.75rem (Use for section titles).
*   **Body & Labels (Inter):** Inter is our workhorse for data entry. Its high x-height ensures readability in dense tables.
    *   *Body-MD:* 0.875rem (Standard text).
    *   *Label-SM:* 0.6875rem (Upper-case, tracked out +5% for metadata and table headers).

---

## 4. Elevation & Depth
Hierarchy is achieved through **Tonal Layering**, not structural scaffolding.

### The Layering Principle
Stacking tiers creates a soft, natural lift. Place a `surface_container_lowest` card atop a `surface_container_low` background. This "white on off-white" transition is the hallmark of high-end digital interfaces.

### Ambient Shadows
When a component must float (e.g., a primary action menu):
- **Blur:** 24px - 40px.
- **Opacity:** 4% - 6%.
- **Color:** Use a tinted shadow based on `on_surface` (#191c1e) rather than pure black.

### The "Ghost Border" Fallback
If accessibility requirements demand a border (e.g., high-contrast mode), use a **Ghost Border**:
- **Token:** `outline_variant` (#c3c6d6) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
- **Primary:** Gradient (`primary` to `primary_container`), `xl` roundedness (0.75rem), white text.
- **Secondary:** `surface_container_high` background with `on_surface` text. No border.
- **Tertiary:** Pure text with `primary` color, using `6` (1.3rem) horizontal padding for a clear hit area.

### Data Tables & Lists
- **Rule:** Absolute prohibition of horizontal/vertical divider lines. 
- **Separation:** Use a `2.5` (0.5rem) vertical gap between rows. 
- **Alternating:** Instead of "Zebra stripes," use a subtle `surface_container_low` hover state on the entire row to indicate focus.
- **Headers:** Use `label-sm` in `on_surface_variant` (#434654) to keep them distinct from the data.

### Form Inputs
- **Container:** `surface_container_lowest` background.
- **Active State:** A 2px bottom-heavy accent using `primary`. Avoid the "four-sided box" look where possible; favor a "soft well" aesthetic using the `md` roundedness scale.
- **Validation:** Errors use `error` (#ba1a1a) text but the background should shift to `error_container` (#ffdad6) for the entire input field to ensure immediate recognition.

### Chart Containers
- **Visuals:** Use `secondary` (Teal), `tertiary` (Purple), and an accent Orange for data. 
- **Styling:** Bars and lines should have `sm` (0.125rem) rounded corners. Use a 10% opacity fill of the line color for area charts to create depth.

---

## 6. Do's and Don'ts

### Do:
- **Do** use `20` (4.5rem) or `24` (5.5rem) spacing between major sections to allow the eye to rest.
- **Do** use `xl` roundedness (0.75rem) for main dashboard containers to soften the "enterprise" feel.
- **Do** layer `surface_container_lowest` elements over `surface_dim` for high-intensity data management screens.

### Don't:
- **Don't** use 100% black text. Always use `on_surface` (#191c1e) for better long-term readability.
- **Don't** use "Drop Shadows" on standard cards. Reserve elevation for interactive, temporary overlays (modals/tooltips).
- **Don't** use divider lines to separate list items. Use the `spacing` scale to create clear "islands" of information.
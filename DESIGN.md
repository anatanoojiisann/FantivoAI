---
name: Fantivo AI
description: A cinematic discovery feed joined to a focused AI video studio.
colors:
  theatre-black: "#08080d"
  stage-surface: "#121118"
  raised-surface: "#191721"
  warm-ivory: "#f7f1eb"
  quiet-lavender: "#9993a2"
  studio-violet: "#7864f6"
  action-violet: "#6659ec"
  star-gold: "#ffc84a"
  success-mint: "#6ed6aa"
  danger-rose: "#ff7f91"
typography:
  display:
    fontFamily: "Didot, Bodoni 72, Bodoni MT, Georgia, Songti SC, STSong, serif"
    fontSize: "clamp(2.25rem, 10vw, 3.125rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Display, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Display, Segoe UI, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 680
    lineHeight: 1.2
rounded:
  control: "12px"
  panel: "16px"
  media: "20px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action-violet}"
    textColor: "{colors.warm-ivory}"
    rounded: "{rounded.panel}"
    height: "62px"
    padding: "0 18px 0 21px"
  field:
    backgroundColor: "{colors.stage-surface}"
    textColor: "{colors.warm-ivory}"
    rounded: "{rounded.panel}"
    padding: "16px"
  media-frame:
    backgroundColor: "{colors.stage-surface}"
    rounded: "{rounded.media}"
---

# Design System: Fantivo AI

## Overview

**Creative North Star: "Cinematic Atelier"**

Fantivo AI combines the emotional pull of a film editorial with the precision of a compact production tool. Discovery is image-first and generous; creation, jobs, and payments are quieter, denser, and ordered around the next decision. The interface rejects the generic neon AI dashboard, nested glass cards, and decorative copy that competes with the task.

**Key Characteristics:**

- Near-black, low-reflection stage surfaces.
- Warm cinematic imagery as the main source of emotion.
- Editorial serif only for major page moments; practical sans for controls.
- Violet communicates selection and primary action; gold means credits only.
- State, cost, and required input appear before implementation detail.

## Colors

The palette is restrained: warm ivory and graphite surfaces carry the interface, one studio violet carries interaction, and imagery provides the wider emotional range.

**The Semantic Accent Rule.** Violet is for selection, focus, and creation; gold is reserved for Telegram Stars and credit value.

## Typography

**Display Font:** Didot/Bodoni/Georgia with Songti SC/STSong for Chinese.

**Body Font:** Platform UI sans stack.

The pairing makes discovery feel authored without making operational controls precious. Display type is limited to page headings and prominent balances; all instructions, settings, status, and purchase details stay sans-serif.

**The Two-Voice Rule.** Editorial serif creates one focal moment per page; the task itself always speaks in the UI sans.

## Layout

The Mini App is mobile-first from 320px to 700px, centered above that width. Page gutters are 18px, tightening to 12px below 380px and opening to 26px above 620px. The spacing rhythm uses 8, 12, 16, and 24px steps. Home uses horizontal media rails with one dominant frame; Create uses one vertical task column; Works uses status-first media rows; Top up uses a single purchase sequence without a containing sheet.

Persistent bottom navigation respects Telegram safe areas. Horizontal rails deliberately reveal the next item, while the document itself must never overflow horizontally. RTL reverses reading and rail direction without reversing semantic icon meaning.

## Elevation & Depth

The system is flat by default. Depth comes from tonal layering and thin translucent borders; shadows appear only under the persistent navigation and primary action where separation from moving content matters. Full-page glass effects and border-plus-large-shadow cards are not part of this world.

## Shapes

Media uses 20px corners, structural panels and primary buttons use 16px, controls use 12px, and small selection/status chips are pills. Borders are one pixel and quiet. Circular geometry is reserved for icon-only controls, play affordances, and status indicators.

## Components

### Buttons

Primary buttons are 62px tall, solid action violet, 16px radius, and use a contained 34px arrow tile. Disabled buttons remain legible on a graphite field. Active feedback scales to 0.98; focus receives a clear visible ring.

### Chips

Category and status chips use quiet borders and no shadow. Selected chips invert to violet with white text. Counts remain subordinate inside darker pill inserts.

### Cards / Containers

Use cards only for a real unit: a media item, job, plan, or legal consent. Cards use stage surfaces, one quiet border, 16px radius, and no ambient shadow. Avoid placing a card around a complete page section.

### Inputs / Fields

Prompt fields use a 16px panel with the label above the editable area, count in the lower corner, and a violet border plus low-opacity focus ring. Upload media uses a 20px frame and a real image preview; empty upload states use a Phosphor image icon and concise format help.

### Navigation

The compact top bar carries the real Fantivo mark, language, and credit balance. Bottom navigation is a 68px blurred stage surface; active destinations use a tonal violet field and the same Phosphor outline icon family as the rest of the app.

### Cinematic Rail

Home's dominant frame is tall, image-led, and followed by a smaller style rail. The next card remains partially visible as the scroll invitation. Titles sit inside a restrained bottom scrim and never replace the imagery with decorative placeholder art.

## Do's and Don'ts

### Do:

- **Do** let production imagery lead Home and template detail.
- **Do** keep credit cost attached to the creation or purchase action.
- **Do** keep job state visible before model and provider details.
- **Do** preserve 320px, RTL, reduced-motion, and safe-area behavior.

### Don't:

- **Don't** add explanatory copy when the control label already makes the next action clear.
- **Don't** use emoji or Unicode characters as interface icons; use the Phosphor family.
- **Don't** reintroduce the old AuraX lettermark, rainbow AI gradients, or page-sized glass cards.
- **Don't** invent testimonials, performance claims, model capabilities, or payment terms.

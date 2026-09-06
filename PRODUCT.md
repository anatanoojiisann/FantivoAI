# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Telegram users who want to turn a written idea or one reference image into a short AI-generated video, then review the result and keep creating without leaving Telegram.

## Product Purpose

Fantivo AI is a Telegram Mini App for discovering video styles, creating text-to-video or image-to-video jobs, reviewing creation status and results, and managing the credits required to create. Success means a user can move from inspiration to a submitted job with clear cost and status, then understand what happened without operational copy getting in the way.

## Positioning

Fantivo AI connects an image-led inspiration feed directly to a focused creation task, so styles are actionable starting points rather than a separate gallery.

## Operating Context

- The product runs inside Telegram as a mobile-first Mini App, with a browser preview used for local development.
- The primary flow is Home → template or inspiration detail → Create → Works; Top up supports the same flow when credits are insufficient.
- Users may create from text, from one image, or from an eligible template. They monitor queued, generating, completed, failed, cancelled, and refunded states.
- Payments use Telegram Stars and legal consent must remain explicit.

## Capabilities and Constraints

- Preserve the existing four destinations: Home, Create, Works, and Top up.
- Preserve current routing, API boundaries, analytics intents, localization support, job cancellation/refund behavior, payment confirmation, amount validation, and idempotency.
- The current video workflow supports text prompts and at most one uploaded JPG, PNG, or WebP image.
- Credit cost must be visible before submission; unavailable or unsupported template states must stay honest.
- Backend, payment, and provider behavior are outside this visual redesign.

## Brand Commitments

- Product name: Fantivo AI.
- Approved direction: “Cinematic Atelier.” Home and template detail use cinematic, editorial image-led composition; Create, Works, and Top up use a restrained studio-tool hierarchy.
- The two supplied reference images are binding visual references for composition, type contrast, media prominence, controls, and overall finish.
- Product voice is concise, creative, calm, and task-oriented. Internal implementation detail and redundant explanatory copy should not interrupt primary flows.

## Evidence on Hand

- `output/design-references/fantivo-reference-editorial.jpg`: approved editorial discovery reference.
- `output/design-references/fantivo-reference-studio.jpg`: approved focused creation-tool reference.
- Existing production UI, localized strings, API-backed feed content, jobs, wallet products, and legal pages are the factual content source. No testimonials, customer claims, benchmarks, or new pricing claims are supplied and none should be invented.

## Product Principles

1. Let imagery start the creative decision.
2. Keep creation settings legible and close to the action they affect.
3. Show job state before implementation detail.
4. Make credit and payment consequences clear before commitment.
5. Remove copy that explains the interface instead of helping the next user action.

## Accessibility & Inclusion

Maintain keyboard focus, semantic labels, reduced-motion support, mobile safe areas, right-to-left layout, and readable contrast across all supported locales.

# Sous — UI Design Direction

## Reference

Primary visual reference:

`docs/design/sous-reference.png`

This reference is the visual source of truth for Task 4.

Do not reinterpret Sous as a generic AI/SaaS application.

## Direction

The selected direction is "Pass — Mise en place".

Sous should feel like a purpose-built kitchen instrument combined with
professional cooking instructions.

The interface is functional, typographic and high-contrast.

It should NOT look like:

- an AI chatbot,
- a SaaS dashboard,
- a generic generated landing page,
- a collection of rounded cards.

## Core visual principles

### 1. Current action dominates

During cooking, the current instruction is the most visually important
element on the screen.

Example:

ADD THE TOMATOES.

It must remain readable from a distance.

### 2. Strong typography

Use typography, scale, weight, spacing and rules to establish hierarchy.

Do not rely on cards, shadows or decorative containers to separate every
piece of information.

### 3. Flat, structured layout

Prefer:

- strong horizontal rules,
- clear sections,
- generous whitespace,
- explicit alignment,
- numbered progress,
- restrained borders.

Avoid excessive rounded corners and floating cards.

### 4. Kitchen-instrument character

The interface should feel appropriate beside a cutting board or stove.

Use concepts such as:

- numbered steps,
- quantities,
- cooking time,
- heat level,
- timer controls,
- clear physical-action language.

Do not introduce fake appliance decoration.

### 5. Restrained palette

Follow the reference:

- warm off-white / cream cooking surface,
- very dark charcoal text and control areas,
- restrained warm orange/red accent,
- secondary muted text.

Do not introduce purple, blue AI gradients, neon colors or glass effects.

### 6. Voice is a first-class interaction

The bottom voice/action area is part of the primary interface.

It should clearly support states such as:

- idle,
- listening,
- thinking,
- speaking.

Do not use a glowing AI orb.

For Task 4 voice is not functional yet, so the visual treatment may be
represented without implementing microphone behavior.

### 7. Desktop cooking mode

Desktop should work when viewed from approximately 1–2 meters away.

Prioritize:

- very large current instruction,
- current step / total steps,
- important quantities,
- time,
- heat,
- clear Done action.

Secondary information should not compete with the current instruction.

### 8. Mobile cooking mode

Mobile is not simply a scaled-down desktop.

Preserve the hierarchy:

1. current step,
2. instruction,
3. quantity,
4. time / heat,
5. primary action,
6. voice/input state.

Large touch targets are required.

## Interaction principles

Sous is state-first, not chat-first.

Do not create a conventional chat transcript as the main cooking UI.

Adaptive interactions such as:

"I don't have tomato paste"

should produce a concise response and visibly update the cooking plan.

The user should then return naturally to the current cooking state.

`Done · next` is the primary deterministic cooking action.

Typing remains available as a fallback.

## Other application states

The visual language from the cooking screen should extend to:

### Ingredient input

Simple, direct entry.

The primary question is:

"What do you have?"

Avoid a generic marketing hero.

### Proposal

Present one proposed dish clearly.

Emphasize:

- dish name,
- short description,
- servings,
- estimated time,
- accept/start action.

Do not present it as a dashboard card grid.

### Adaptation

Clearly acknowledge that the plan changed.

Show the useful consequence, not internal AI reasoning.

Example:

"No tomato paste — that's fine."

"Use the tomatoes and simmer them longer, until reduced."

Then return attention to the cooking step.

### Complete

Give the finished state a deliberate conclusion without turning it into a
marketing screen.

## Anti-patterns

Do NOT add:

- gradients,
- glassmorphism,
- glowing effects,
- excessive border radius,
- generic AI icons,
- sparkle icons,
- chatbot bubbles as the primary interface,
- dashboard metric cards,
- navigation sidebar,
- decorative charts,
- arbitrary stock food photography,
- excessive animation,
- huge marketing copy.

## Implementation

The reference image defines visual direction, not exact pixel-perfect
requirements.

Adapt it to the real application state and data model.

Prefer semantic HTML and straightforward CSS.

Do not introduce a large component/design-system dependency solely to recreate
the design.

Accessibility, responsiveness and real application behavior take priority
over exact pixel matching.
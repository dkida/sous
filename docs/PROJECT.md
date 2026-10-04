# Sous

Sous is a voice-first AI cooking companion built for a real person:
my partner, Natalia.

## Problem

Cooking from a recipe is awkward in a real kitchen.

Your hands are often wet or dirty, recipes require touching and scrolling
through a phone, and static recipes break down when reality changes:

- an ingredient is missing,
- something is cooking faster than expected,
- the cook wants more portions,
- an ingredient has already been added incorrectly,
- the cook needs clarification,
- or they simply forget what comes next.

Sous should behave more like another person cooking with you than a recipe
displayed on a screen.

## Core experience

A user should be able to say:

"I have pasta, onion, garlic, canned tomatoes and parmesan. What can I make?"

Sous proposes something appropriate.

After the user accepts, Sous creates a structured cooking plan and guides
them through it step by step.

During cooking, the user can naturally interrupt:

"What do I do next?"
"I don't actually have passata."
"My onions are starting to burn."
"How much garlic?"
"Let's make four portions instead."
"I already added the tomatoes."

Sous understands the current cooking state and adapts the remaining plan.

## North-star demo

The user tells Sous what ingredients they have and cooks the resulting meal
from start to finish without needing another app or web search.

Stretch goal: after starting the cooking session, the entire experience can
be completed hands-free.

## AI philosophy

The LLM reasons; the application owns state.

The model must not be the sole source of truth for:
- current recipe
- current step
- completed steps
- ingredient quantities
- substitutions
- timers

These are represented as structured application state.

The model may reason about the state and request changes through defined
operations/tools.

## Open AI

The reasoning model is Mistral Small 4 (`mistral-small-2603`), an Apache 2.0
open-weight model. It was chosen after benchmarking it against Gemma 4, which was
too slow for interactive cooking when hosted.

The architecture must keep the model provider replaceable, so the open-weight
model can be hosted for the deployed demo or run locally without redesigning the
agent.

Open-weight AI is core to the product, not an optional feature.

## Voice

ElevenLabs provides speech-to-text and text-to-speech.

Voice is an interface around the cooking agent, not the agent itself.

Initial implementation may use push-to-talk.
Hands-free conversation and wake-word detection are later milestones.

## Stack

- TypeScript
- Next.js
- Mistral Small 4 (open weights)
- ElevenLabs
- Render
- in-memory session state for MVP

## Explicitly out of scope for MVP

- authentication
- user accounts
- database
- native iOS/Android apps
- Arduino
- social features
- meal planning
- grocery ordering
- nutritional tracking
- complex recipe management
- multi-agent architecture
- elaborate framework abstractions

## Product principle

Do not optimize for feature count.

Optimize for one convincing cooking session.
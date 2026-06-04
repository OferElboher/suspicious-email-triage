# Cursor project rules reference

This file was renamed from the accidental `Untitled` file. It mirrors the project guidance that also lives in `.cursorrules`.

## AUTONOMY & QUOTA OPTIMIZATION (CRITICAL)

- DO NOT stop to ask clarification questions, permission, or architectural opinions.
- If requirements are ambiguous or missing, make the most logical, industry-standard engineering assumption and proceed immediately with execution.
- If technical choices must be made, pick the most stable, scalable, and modern option.
- Document all assumptions, architectural choices, and deviations clearly using inline code comments or markdown blocks in your response.

## CODE STYLE & ARCHITECTURE

- Write clean, modular, and maintainable code adhering to SOLID principles.
- Use explicit, descriptive variable and function names; avoid cryptic abbreviations.
- Favor declarative, functional programming patterns where appropriate.
- Maintain consistent formatting and clear separation of concerns.
- Avoid code duplication.
- Keep functions small, focused, and limited to a single responsibility.

## ERROR HANDLING & RESILIENCE

- Never write silent failures or empty catch blocks.
- Handle risky operations with explicit error handling.
- Provide meaningful, actionable error messages.
- Implement graceful degradation or safe fallback mechanisms.
- Validate incoming data, API payloads, and function inputs before processing.

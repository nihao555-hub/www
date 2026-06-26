# Vendored front-end design skills (taste-skill series)

These `SKILL.md` files are vendored from
[github.com/Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)
(MIT, see `LICENSE`) as the front-end **design** knowledge base for the AI site
generator. They are the "anti-slop" discipline the design agent consults before
making any design decision.

At runtime the site generator does **not** read these large files on every model
call. Instead, `src/lib/ai/taste-skill.ts` carries a compact, hand-distilled
version (`TASTE_SKILL_GUIDE` / `TASTE_SKILL_JSX_RULES`) that is injected into the
analysis, hero-JSX, section-JSX and self-polish prompts so the agent always
prioritizes it while keeping each call token-light.

Update flow: if you re-pull upstream, refresh these files **and** re-distill the
constants in `src/lib/ai/taste-skill.ts` to match.

Included skills: `taste-skill` (primary), `soft-skill`, `minimalist-skill`,
`brutalist-skill`, `redesign-skill`, `output-skill`, `gpt-tasteskill`.

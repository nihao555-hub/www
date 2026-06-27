# Test Plan — AI Smart Template Matching (PR #13)

## What changed
Template mode can now **auto-pick** the best-fit template from the brief instead of
requiring a manual choice. Form defaults to 「✨ AI 智能匹配」 (`templateId='auto'`);
`runTemplateGeneration` calls `pickTemplateForBrief()` which asks the LLM to choose one
template id from the catalog and emits a `match` step + Chinese log with the reason.
Library expanded from 8 → 18 templates (10 new >10k-star repos).

## Environment
- Local dev server `http://localhost:3000` (relay + gpt-image configured in .env)
- Admin: admin@test.com / Test1234!

## Primary flow (recorded)

### Test 1 — It should auto-match a storefront template for a D2C beauty brief
1. Go to `http://localhost:3000/generate` (already logged in).
2. Click the **套用模板** mode toggle.
   - PASS: a template grid appears; the first card is **AI 智能匹配** and is shown selected
     (primary ring + check badge). FAIL: no grid, or smart-match card absent/not selected.
3. In the bottom brief textarea type a D2C beauty brief, e.g.:
   `高端野山参抗衰老护肤品牌，主打东方草本精华，目标是高净值女性用户` and submit.
4. Watch the workflow panel.
   - PASS: a step labeled **AI 智能匹配最契合的模板** appears, and a log line reads
     `AI 智能匹配：选用「...」模板 — <reason>` naming an e-commerce/D2C template
     (expected `D2C Brand` or `Medusa Storefront`, category E-commerce). The chosen
     template chip is shown on the match step.
   - FAIL: no `match` step, no log naming a chosen template, or it picks an unrelated
     category (e.g. a developer/CRM template for a skincare brand).
5. Let generation finish.
   - PASS: a `done` event yields a preview link and the site renders at `/s/<slug>` with a
     hero, sections and images, no white screen / no console errors.
   - FAIL: error event, white screen, or broken render.

### Assertion that distinguishes working vs broken
If smart-match were broken, step 4 would show **no `match` step / no chosen-template log**,
or the picked template's category would not match the brief's industry. A correct
implementation visibly names an e-commerce template for a skincare brief.

## Out of scope
- Re-testing all 18 matches in the UI (already proven 8/8 via relay script).
- Manual template selection path (unchanged behavior).

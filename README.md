# Arkansas Education Returns

A buildless interactive education-investment calculator using official College Scorecard data for Arkansas institutions. The interface and scenario exports are in English.

## Run locally

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. No API key, package installation, or build step is needed. The pinned public data snapshot is bundled in `dist/data/scorecard-ar.json`.

## Tests

```sh
node --test tests/*.test.mjs
```

The arithmetic tests include known IRRs, negative IRR with positive earnings differences, undefined investment cases, dated cash flows, growth timing, and invalid inputs.

## Data

The October 15, 2026 College Scorecard release is pinned. See [scripts/DATA.md](scripts/DATA.md) for the official download URLs, field definitions, hashes, suppression rules, and reproduction command. All raw source archives stay outside the repository.

The UI includes currently operating Arkansas institutions with program records. Outcome observations are deduplicated by OPEID6, CIP, and credential, while retaining branch links. Outcomes can represent graduates working outside Arkansas and, for some institutions, branches in multiple states.

## Model

This is a descriptive median-based scenario, not an estimate of education's causal effect. The original short-cut method uses arithmetic means; this implementation uses Scorecard medians and adds incremental private costs.

Annual net study investment = comparison earnings − in-study earnings + incremental private cost.

Shortcut return = initial annual earnings difference × sensitivity share / total undiscounted study investment.

For `s` years of study, costs occur at times 0 through `s−1`. The `n` post-completion benefits occur at `s` through `s+n−1`, with growth starting at the second benefit. IRR is computed only for conventional negative-then-positive cash flows with one sign change. NPV discounts the same cash flows to time 0. Payback is the first scheduled year recovering the investment without interpolation.

Earnings are in 2024 dollars. All scenario inputs and rates are interpreted in real 2024 dollars. For undergraduate programs, the initial cost assumption copies institution-level 2025–26 in-state tuition numerically without price adjustment, explicitly labeled in the UI. Users should replace it with their own incremental cost estimate in 2024 dollars. Net price is a reference only and is never silently substituted for incremental costs. Graduate costs require user entry; graduate comparisons default only to a reported same-school, same-CIP bachelor's outcome, otherwise require a selection or custom earnings.

Completion, employment, tax, financing, and social externality risks are not modeled. Four-year post-completion income serves as a constant initial earnings proxy, rather than a measured first-year or lifetime earnings profile.

## Files

- `dist/index.html`, `dist/styles.css`: interface and responsive styling.
- `dist/app.mjs`: selection, assumptions, charts, and CSV export.
- `dist/data-model.mjs`: institution/program matching and initial selection.
- `dist/returns.mjs`: pure financial arithmetic.
- `scripts/fetch_scorecard.py`: reproducible official-data ingestion.

## GitHub Pages

Live site: https://ryotarohiraki.github.io/arkansas-education-returns/

Push changes to `main` to publish the `dist/` directory through GitHub Actions.
The Pages publishing source is **GitHub Actions**. The deployment workflow can
also be started manually from the Actions tab. No API key or build step is
required; asset and data URLs are relative so the app works under this subpath.
Only `dist/` is deployed. Source scripts, tests, and documentation remain in the
repository.

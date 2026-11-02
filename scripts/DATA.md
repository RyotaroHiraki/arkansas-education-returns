# College Scorecard Arkansas data

The site reads `dist/data/scorecard-ar.json`. `fetch_scorecard.py` produces this
file from the **October 15, 2026** official College Scorecard most-recent
institution and field-of-study ZIPs. It uses only Python's standard library.

Run `python3 scripts/fetch_scorecard.py --download` to download and rebuild this
pinned release. Downloads go to `/private/tmp/arkansas-shortcut` by default.
Use `--raw-dir` to change the cache and omit `--download` to rebuild cached data.
The source URLs and SHA-256 hashes are recorded in the output metadata.
Updating the release requires reviewing the current official glossary and data
dictionary cohort maps; replacing a filename date alone is insufficient.

## Sources and observations

- [Official download page](https://collegescorecard.ed.gov/data/).
- [Official glossary](https://collegescorecard.ed.gov/data/glossary/).
- [Official data dictionary](https://collegescorecard.ed.gov/files/CollegeScorecardDataDictionary.xlsx).
- [Field-of-study methods](https://collegescorecard.ed.gov/files/FieldOfStudyDataDocumentation.pdf).
- [Graduate earnings errata](https://collegescorecard.ed.gov/files/GraduateStudentsEarningsErrata.pdf).

`EARN_MDN_4YR` is the median annual earnings of federally aided completers
working and not enrolled four years after completion. The completion cohorts
are 2017–18 and 2018–19, observed in calendar years 2022 and 2023 and expressed
in **2024 dollars**. `EARN_COUNT_WNE_4YR` is the corresponding reported count;
it is not the number of all students who entered a program. Both earnings and
counts are subject to the source's privacy procedures. `EARN_MDN_4YR_NAT` is
the national field-and-credential comparison.

`EARN_THR_STATE` and `EARN_THR_NAT` are the state and national median earnings
of high-school/GED graduates aged 25–34 with earnings and not enrolled. The
current glossary and `Most_Recent_Inst_Cohort_Map` say 2019–2023 ACS pooled,
adjusted to 2024 dollars. The dictionary's separate historical cohort-map
sheet instead labels the threshold 2024 ACS. This documentation discrepancy
is retained in metadata; the observed numbers are not altered.

The institution cost references are **nominal source academic-year dollars**:
tuition and required fees are for 2025–26, while net price is for 2024–25.
They have not been converted to 2024 dollars. These are undergraduate
institution-level references, not graduate or program-specific fees. Net price
includes living expenses and deducts grants. At non-academic-year institutions
it represents the largest program; programs shorter than a year can have a
full-program net price. Costs are separate reference values and no costs are
attached to program rows.

## Scope and keys

Institutions are selected on `STABBR == AR` and joined by `UNITID`. This means
the school is in Arkansas, not that graduates stay or work in Arkansas.
The data retain closed institutions with `operating: false` so the UI can
filter explicitly. Historical completions do not prove a program is currently
accepting students.

Programs are deduplicated on **OPEID6 × four-digit CIP × credential**, the
underlying earnings aggregation unit. `id` and `earningsKey` contain this key.
`institutionId` identifies the representative Arkansas campus;
`relatedInstitutionIds` retains all Arkansas campus rows offering the program.
UI campus filtering must include that array. `earningsGroupInstitutionIds` and
`earningsGroupStates` expose other reported branches sharing the outcome.
An earnings count must never be added across repeated branches or across
credentials as though it counted distinct people.

Identifiers remain strings, preserving leading zeros. Credential codes are
integers 1–8 using official labels. `PS`/`PrivacySuppressed` become JSON `null`
with a `suppressed` status; `NA`, `NULL`, and blanks become `null` with an
`unavailable` status. Real zeros remain numeric zeros. There is no imputation,
fallback to other earnings horizons, or invented data.

## Verified snapshot

| Measure | Count |
|---|---:|
| Arkansas institutions | 84 |
| Operating Arkansas institutions | 81 |
| Raw campus-program rows | 2,757 |
| Unique program earnings groups | 2,756 |
| Groups with reported 4-year earnings | 600 |
| Reported groups at operating institutions | 598 |
| Earnings suppressed | 2,090 |
| Earnings unavailable | 66 |

One identical earnings group is repeated at two Arthur's Beauty College
campuses. It appears once in the JSON with both campus IDs. The build checks
that repeated branch monetary/count fields agree before deduplicating. It
also validates required columns, unique institution and program keys,
institution joins, finite numeric values, and null/status reconciliation.

These observed medians support a descriptive, assumption-driven calculator.
They are not the arithmetic means required by the paper's original shortcut,
causal effects of schooling, or lifetime earnings. The high-school benchmark
is not the counterfactual for an incremental graduate-degree calculation.

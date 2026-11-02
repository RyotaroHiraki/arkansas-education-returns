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
- [Institution methods](https://collegescorecard.ed.gov/files/InstitutionDataDocumentation.pdf), October 2026, pp. 30–34.
- [Field-of-study methods](https://collegescorecard.ed.gov/files/FieldOfStudyDataDocumentation.pdf).
- [Graduate earnings errata](https://collegescorecard.ed.gov/files/GraduateStudentsEarningsErrata.pdf).

`EARN_MDN_4YR` is the median annual earnings of federally aided completers
working and not enrolled four years after completion. The completion cohorts
are 2017–18 and 2018–19, observed in calendar years 2022 and 2023 and expressed
in **2024 dollars**. `EARN_COUNT_WNE_4YR` is the corresponding reported count;
it is not the number of all students who entered a program. Both earnings and
counts are subject to the source's privacy procedures. `EARN_MDN_4YR_NAT` is
the national field-and-credential comparison.

The **Overall — all fields** view uses the institution file's
`MD_EARN_WNE_4YR`, stored as `overallEarnings`. It is the official median
for federally aided **undergraduate completers**, across fields and
undergraduate credential levels, who are working and not enrolled four years
after completion. It is neither an average of program medians nor a
credential-specific result. `COUNT_WNE_4YR` supplies `overallEarningsCount`.
Both have explicit reported/suppressed/unavailable status fields. The current
dictionary's `Most_Recent_Inst_Cohort_Map` confirms the same 2017–18 and 2018–19
completion cohorts, 2022 and 2023 earnings observations, and **2024 dollars**.
The institutional technical documentation confirms the undergraduate scope;
the current glossary confirms the four-year measurement horizon. These
outcomes exclude noncompleters, nonworkers and people still enrolled.

The separate `MD_EARN_WNE_P10` measure follows **entrants**, including
noncompleters, ten years after entry; it is not used for Overall and is not a
fallback for missing four-year values. Likewise, the
[FAFSA lower-earnings indicator](https://fsapartners.ed.gov/knowledge-center/library/electronic-announcements/2025-12-03/new-lower-earnings-indicator-fafsar-form)
adjusts earnings to January 2026 dollars in its March 2026 update. This site
uses the unchanged **Scorecard 2024-dollar values**, not those separately
inflation-adjusted FAFSA values.

`PREDDEG`, stored as `predominantCredential`, describes the institution's
predominant undergraduate award in 2024–25: 0 is unclassified, 1 certificate,
2 associate, 3 bachelor, and 4 exclusively graduate. It does not restrict
the Overall earnings population. Any default study duration based on it is
an editable scenario assumption, not a measured time to completion.

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

Overall earnings likewise come from the official OPEID6 group, potentially
covering multiple branches and states. The institution rows retain the source
values and use the existing `opeidInstitutionIds` and `opeidStates` to expose
that scope. Do not add Overall counts across branch rows or use program
counts to reconstruct this official median. The Overall institution selector
can include operating institutions even if they have no program-level rows.

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
| Institutions with reported Overall earnings | 74 |
| Operating institutions with reported Overall earnings | 71 |
| Overall earnings suppressed | 8 |
| Overall earnings unavailable | 2 |
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

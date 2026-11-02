#!/usr/bin/env python3
"""Build the Arkansas-only site data from the pinned official Scorecard release.

Python standard library only. Raw ZIPs stay outside the repository. This script
does not estimate returns or fill unavailable earnings with another measure.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import subprocess
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

RELEASE = "2026-10-15"
STAMP = "10152026"
BASE = "https://ed-public-download.scorecard.network/downloads/"
SOURCES = {
    "institution": BASE + f"Most-Recent-Cohorts-Institution_{STAMP}.zip",
    "fos": BASE + f"Most-Recent-Cohorts-Field-of-Study_{STAMP}.zip",
}
NULL_TOKENS = {"", "NA", "N/A", "NULL", "PrivacySuppressed", "PS"}
SUPPRESSED_TOKENS = {"PrivacySuppressed", "PS"}
CONTROL_LABELS = {1: "Public", 2: "Private nonprofit", 3: "Private for-profit"}
ROOT = Path(__file__).resolve().parents[1]


def number(raw: str | None) -> int | float | None:
    if raw is None or raw in NULL_TOKENS:
        return None
    n = float(raw)
    if not math.isfinite(n):
        raise ValueError(f"Unexpected nonfinite source value: {raw!r}")
    return int(n) if n.is_integer() else n


def status(raw: str | None) -> str:
    if raw in SUPPRESSED_TOKENS:
        return "suppressed"
    return "reported" if number(raw) is not None else "unavailable"


def archive_rows(path: Path, required: set[str]):
    with zipfile.ZipFile(path) as archive:
        members = [n for n in archive.namelist() if n.endswith(".csv") and "/" not in n]
        if len(members) != 1:
            raise ValueError(f"Expected one top-level CSV in {path}: {members}")
        with archive.open(members[0]) as source:
            reader = csv.DictReader(io.TextIOWrapper(source, encoding="utf-8-sig"))
            missing = required.difference(reader.fieldnames or [])
            if missing:
                raise ValueError(f"Missing source columns in {path}: {sorted(missing)}")
            yield from reader


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def build(raw_dir: Path, retrieved_at: str) -> dict:
    paths = {key: raw_dir / f"scorecard-{key}-{STAMP}.zip" for key in SOURCES}
    all_institutions = {}
    for row in archive_rows(paths["institution"], {
        "UNITID", "OPEID6", "INSTNM", "CITY", "STABBR", "CONTROL", "CURROPER",
        "NPT4_PUB", "NPT4_PRIV", "TUITIONFEE_IN", "TUITIONFEE_OUT", "EARN_THR_STATE",
    }):
        if row["UNITID"] in all_institutions:
            raise ValueError(f"Duplicate institutional UNITID: {row['UNITID']}")
        all_institutions[row["UNITID"]] = row
    ar = {key: row for key, row in all_institutions.items() if row["STABBR"] == "AR"}
    ar_opeids = {row["OPEID6"] for row in ar.values()}
    related_by_opeid = defaultdict(list)
    for row in all_institutions.values():
        if row["OPEID6"] in ar_opeids:
            related_by_opeid[row["OPEID6"]].append(row)

    campus_programs = []
    related_programs = defaultdict(set)
    for row in archive_rows(paths["fos"], {
        "UNITID", "OPEID6", "CIPCODE", "CIPDESC", "CREDLEV", "CREDDESC",
        "EARN_MDN_4YR", "EARN_COUNT_WNE_4YR", "EARN_MDN_4YR_NAT",
    }):
        key = f"{row['OPEID6']}-{row['CIPCODE']}-{row['CREDLEV']}"
        if row["OPEID6"] in ar_opeids and row["UNITID"] in all_institutions:
            related_programs[key].add(row["UNITID"])
        if row["UNITID"] in ar:
            if ar[row["UNITID"]]["OPEID6"] != row["OPEID6"]:
                raise ValueError(f"UNITID/OPEID6 conflict: {row['UNITID']}")
            campus_programs.append(row)

    groups = defaultdict(list)
    for row in campus_programs:
        groups[f"{row['OPEID6']}-{row['CIPCODE']}-{row['CREDLEV']}"].append(row)
    programs = []
    for key, group in groups.items():
        # Repeated branch outcomes describe one OPEID6 group, not extra people.
        group.sort(key=lambda r: (ar[r["UNITID"]].get("CURROPER") != "1",
                                  ar[r["UNITID"]].get("MAIN") != "1", r["UNITID"]))
        row = group[0]
        for column in ("EARN_MDN_4YR", "EARN_COUNT_WNE_4YR", "EARN_MDN_4YR_NAT"):
            if len({r[column] for r in group}) != 1:
                raise ValueError(f"Conflicting repeated branch values: {key} {column}")
        ids = sorted({r["UNITID"] for r in group})
        national_ids = sorted(related_programs[key])
        programs.append({
            "id": key,
            "institutionId": row["UNITID"],
            "relatedInstitutionIds": ids,
            "opeid6": row["OPEID6"],
            "cip": row["CIPCODE"],
            "field": row["CIPDESC"],
            "credential": int(row["CREDLEV"]),
            "credentialLabel": row["CREDDESC"],
            "earnings": number(row["EARN_MDN_4YR"]),
            "earningsNational": number(row["EARN_MDN_4YR_NAT"]),
            "earningsCount": number(row["EARN_COUNT_WNE_4YR"]),
            "earningsStatus": status(row["EARN_MDN_4YR"]),
            "earningsNationalStatus": status(row["EARN_MDN_4YR_NAT"]),
            "earningsCountStatus": status(row["EARN_COUNT_WNE_4YR"]),
            "earningsKey": key,
            "earningsGroupInstitutionIds": national_ids,
            "earningsGroupStates": sorted({all_institutions[i]["STABBR"] for i in national_ids}),
            "sourceRowCount": len(group),
            "operating": any(ar[i].get("CURROPER") == "1" for i in ids),
        })
    programs.sort(key=lambda p: (ar[p["institutionId"]]["INSTNM"], p["credential"], p["field"]))

    institutions = []
    for institution_id, row in ar.items():
        control = number(row["CONTROL"])
        net_price_field = "NPT4_PUB" if control == 1 else "NPT4_PRIV"
        related = related_by_opeid[row["OPEID6"]]
        offered = [p for p in programs if institution_id in p["relatedInstitutionIds"]]
        institutions.append({
            "id": institution_id,
            "name": row["INSTNM"],
            "city": row["CITY"],
            "state": row["STABBR"],
            "control": control,
            "controlLabel": CONTROL_LABELS.get(control, "Not reported"),
            "opeid6": row["OPEID6"],
            "mainCampus": row.get("MAIN") == "1",
            "operating": row.get("CURROPER") == "1",
            "netPrice": number(row[net_price_field]),
            "netPriceField": net_price_field,
            "netPriceAcademicYear": "2024-25",
            "tuitionInState": number(row["TUITIONFEE_IN"]),
            "tuitionOutState": number(row["TUITIONFEE_OUT"]),
            "tuitionAcademicYear": "2025-26",
            "costPriceBasis": "Nominal source academic-year dollars; not converted to 2024 dollars.",
            "highSchoolEarnings": number(row["EARN_THR_STATE"]),
            "highSchoolEarningsNational": number(row.get("EARN_THR_NAT")),
            "costOfAttendanceAcademicYear": number(row.get("COSTT4_A")),
            "costOfAttendanceProgramYear": number(row.get("COSTT4_P")),
            "opeidInstitutionIds": sorted(r["UNITID"] for r in related),
            "opeidStates": sorted({r["STABBR"] for r in related}),
            "programCount": len(offered),
            "programsWithEarningsCount": sum(p["earnings"] is not None for p in offered),
        })
    institutions.sort(key=lambda i: i["name"])

    counts = {
        "institutions": len(institutions),
        "operatingInstitutions": sum(i["operating"] for i in institutions),
        "sourceCampusProgramRows": len(campus_programs),
        "uniquePrograms": len(programs),
        "programsWithEarnings": sum(p["earnings"] is not None for p in programs),
        "programsSuppressed": sum(p["earningsStatus"] == "suppressed" for p in programs),
        "programsUnavailable": sum(p["earningsStatus"] == "unavailable" for p in programs),
        "operatingProgramsWithEarnings": sum(p["operating"] and p["earnings"] is not None for p in programs),
        "repeatedBranchRowsRemoved": len(campus_programs) - len(programs),
        "programsByCredential": {},
    }
    for credential in range(1, 9):
        selected = [p for p in programs if p["credential"] == credential]
        counts["programsByCredential"][str(credential)] = {
            "total": len(selected), "reported": sum(p["earnings"] is not None for p in selected),
        }
    # Reconcile source markers and final nulls, rather than treating them as zero.
    raw_status = Counter(status(row["EARN_MDN_4YR"]) for row in campus_programs)
    counts["sourceCampusProgramStatuses"] = dict(raw_status)
    assert len({p["id"] for p in programs}) == len(programs)
    assert counts["programsWithEarnings"] + counts["programsSuppressed"] + counts["programsUnavailable"] == len(programs)
    assert all(p["institutionId"] in ar and 1 <= p["credential"] <= 8 for p in programs)
    assert all((p["earnings"] is not None) == (p["earningsStatus"] == "reported") for p in programs)

    return {
        "metadata": {
            "schemaVersion": 1,
            "retrievedAt": retrieved_at,
            "release": RELEASE,
            "geography": "Institutions located in Arkansas; graduate earnings are not restricted to Arkansas employment or residence.",
            "sourceUrls": {
                "data": "https://collegescorecard.ed.gov/data/",
                "institution": SOURCES["institution"],
                "fieldOfStudy": SOURCES["fos"],
                "glossary": "https://collegescorecard.ed.gov/data/glossary/",
                "dictionary": "https://collegescorecard.ed.gov/files/CollegeScorecardDataDictionary.xlsx",
                "fieldOfStudyDocumentation": "https://collegescorecard.ed.gov/files/FieldOfStudyDataDocumentation.pdf",
                "graduateEarningsErrata": "https://collegescorecard.ed.gov/files/GraduateStudentsEarningsErrata.pdf",
            },
            "rawSha256": {key: sha256(path) for key, path in paths.items()},
            "priceYear": 2024,
            "earningsDescription": "Median annual earnings four years after completion for federally aided completers working and not enrolled; 2017–18 and 2018–19 completion cohorts, earnings observed in calendar years 2022 and 2023, inflation adjusted to 2024 dollars.",
            "earningsCompletionCohorts": ["2017-18", "2018-19"],
            "earningsObservationYears": [2022, 2023],
            "highSchoolDescription": "Median annual earnings of high-school/GED graduates aged 25–34 with earnings and not enrolled, in the institution's state; wages, salary and self-employment; 2019–2023 ACS pooled, adjusted to 2024 dollars.",
            "costYears": {"netPrice": "2024-25", "tuitionInState": "2025-26", "tuitionOutState": "2025-26"},
            "costDescription": "Institution-wide undergraduate reference prices in the source academic year's dollars, not program-specific or graduate costs. Net price includes living expenses and subtracts grants; at non-academic-year schools it concerns the largest program and may be a full-program amount when shorter than one year.",
            "fieldMappings": {
                "institutionId": "UNITID", "opeid6": "OPEID6", "cip": "CIPCODE", "credential": "CREDLEV",
                "earnings": "EARN_MDN_4YR", "earningsNational": "EARN_MDN_4YR_NAT",
                "earningsCount": "EARN_COUNT_WNE_4YR", "highSchoolEarnings": "EARN_THR_STATE",
                "highSchoolEarningsNational": "EARN_THR_NAT", "netPrice": "NPT4_PUB / NPT4_PRIV",
                "tuitionInState": "TUITIONFEE_IN", "tuitionOutState": "TUITIONFEE_OUT",
            },
            "missingValuePolicy": "PS/PrivacySuppressed => null + suppressed; NA/NULL/blank => null + unavailable. No substitute earnings timepoint or imputation.",
            "aggregation": "One observation per OPEID6 × four-digit CIP × credential. Identical branch rows are deduplicated, with relatedInstitutionIds retained. OPEID6 earnings may cover multiple branches, including branches outside Arkansas. These are not additive people counts.",
            "limitations": [
                "Observed medians are descriptive, not causal effects, lifetime earnings or the arithmetic means in the paper's original shortcut method.",
                "Some program outcomes are suppressed or unavailable; absence is not zero earnings.",
                "Earnings are for federally aided completers, and exclude people not working or still enrolled at measurement.",
                "A high-school benchmark is not a bachelor's-degree counterfactual for graduate study.",
                "Earnings dollars and institution cost reference years differ; current prices should not be described as 2024-dollar observed costs.",
                "Program earnings reflect historical completers and do not establish whether a program currently accepts applicants.",
            ],
            "documentationNotes": [
                "The October 2026 dictionary's Most_Recent_Inst_Cohort_Map and current glossary identify the high-school threshold as 2023 ACS 5-year pooled; its historical Institution_Cohort_Map instead labels that field 2024 ACS. This build follows the most-recent map and glossary and preserves observed values unchanged.",
            ],
            "counts": counts,
        },
        "institutions": institutions,
        "programs": programs,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=Path("/private/tmp/arkansas-shortcut"))
    parser.add_argument("--output", type=Path, default=ROOT / "dist/data/scorecard-ar.json")
    parser.add_argument("--download", action="store_true", help="Download the pinned official ZIPs with curl.")
    parser.add_argument("--retrieved-at", default=None, help="Preserve an existing retrieval timestamp when rebuilding from cached files.")
    args = parser.parse_args()
    args.raw_dir.mkdir(parents=True, exist_ok=True)
    if args.download:
        for key, url in SOURCES.items():
            subprocess.run(["curl", "--fail", "--location", "--retry", "2", "--output",
                            str(args.raw_dir / f"scorecard-{key}-{STAMP}.zip"), url], check=True)
    result = build(args.raw_dir, args.retrieved_at or datetime.now(timezone.utc).isoformat(timespec="seconds"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(result["metadata"]["counts"], indent=2))
    print(f"Wrote {args.output} ({args.output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

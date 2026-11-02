export const credentialNames = {1:'Certificate',2:"Associate's degree",3:"Bachelor's degree",4:'Post-baccalaureate certificate',5:"Master's degree",6:'Doctoral degree',7:'Professional degree',8:'Graduate certificate'};
export const standardYears = {1:1,2:2,3:4,4:1,5:2,6:5,7:4,8:1};
// Institution outcomes are reported directly by Scorecard. Program medians must
// never be averaged to construct an institution-wide outcome.
export function overallPath(institution) {
  const earnings = institution.overallEarnings ?? null;
  return {
    id: `overall:${institution.id}`,
    kind: 'overall',
    field: 'Overall — all fields of study',
    institutionId: institution.id,
    relatedInstitutionIds: [institution.id],
    credential: 0,
    earnings,
    earningsCount: institution.overallEarningsCount ?? null,
    earningsStatus: institution.overallEarningsStatus ?? (earnings === null ? 'unavailable' : 'reported'),
    earningsCountStatus: institution.overallEarningsCountStatus ?? 'unavailable',
    earningsMetric: 'MD_EARN_WNE_4YR',
    earningsGroupInstitutionIds: [...(institution.opeidInstitutionIds || [institution.id])],
    earningsGroupStates: [...(institution.opeidStates || [institution.state])].filter(Boolean),
    cip: null,
    operating: institution.operating,
  };
}
export function initialPath(institutions) {
  const institution = institutions.find(s => s.operating && s.name === 'University of Arkansas')
    || institutions.find(s => s.operating);
  return institution ? overallPath(institution) : null;
}
export function defaultStudyYears(path, institution) {
  if (path.kind === 'overall') {
    // PREDDEG describes the predominant award, not the duration of every entrant.
    // This remains an editable scenario assumption in the calculator.
    return ({1:1, 2:2, 3:4})[institution.predominantCredential] ?? 4;
  }
  return standardYears[path.credential] ?? 4;
}
export function belongsToInstitution(program, id) {
  return program.institutionId === id || (program.relatedInstitutionIds || []).includes(id);
}
export function preferredBaseline(program, programs) {
  if (program.credential <= 3) return null;
  const candidates = programs.filter(p => p.credential === 3 && p.earnings !== null && p.operating && p.cip === program.cip);
  return candidates.find(p => belongsToInstitution(p, program.institutionId)) || null;
}
export function initialProgram(institutions, programs) {
  const active = new Set(institutions.filter(s=>s.operating).map(s=>s.id));
  const reported = programs.filter(p=>active.has(p.institutionId) && p.earnings !== null);
  const arkansas = institutions.find(s=>s.name==='University of Arkansas');
  return reported.find(p=>p.institutionId===arkansas?.id && p.credential===3 && p.cip==='5202')
    || reported.find(p=>p.institutionId===arkansas?.id && p.credential===3)
    || reported.find(p=>p.credential===3) || reported[0];
}

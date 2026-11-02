export const credentialNames = {1:'Certificate',2:"Associate's degree",3:"Bachelor's degree",4:'Post-baccalaureate certificate',5:"Master's degree",6:'Doctoral degree',7:'Professional degree',8:'Graduate certificate'};
export const standardYears = {1:1,2:2,3:4,4:1,5:2,6:5,7:4,8:1};
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

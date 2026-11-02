import {calculateReturns} from './returns.mjs';
import {credentialNames,belongsToInstitution,preferredBaseline,overallPath,initialPath,defaultStudyYears} from './data-model.mjs?v=20261102-overall';

const $ = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const money = value => value === null || !Number.isFinite(value) ? '—' : fmt.format(value);
const percent = value => value === null || !Number.isFinite(value) ? '—' : `${(value*100).toFixed(1)}%`;
const compact = value => `${value<0?'−':''}$${Math.abs(value)>=1e6?(Math.abs(value)/1e6).toFixed(1)+'m':Math.abs(value)>=1000?Math.round(Math.abs(value)/1000)+'k':Math.round(Math.abs(value))}`;
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sortField = (a,b)=>a.field.localeCompare(b.field);
const state = {data:null,school:null,program:null,result:null,showAll:false,scenario:'Default assumptions'};
const label = program=>program.field.replace(/\.$/,'');
const schoolFor = program=>state.data.institutions.find(s=>s.id===program.institutionId);
const programsFor = id=>state.data.programs.filter(p=>belongsToInstitution(p,id));
const readNumber = id=>$(id).value.trim()===''?null:Number($(id).value);
const isOverall = path=>path?.kind==='overall';
const credentialLabel = path=>isOverall(path)?'All undergraduate credentials':credentialNames[path.credential];

function options(element, items, selected) {
  element.replaceChildren(...items.map(({value,text,disabled=false})=>{const o=new Option(text,String(value));o.disabled=disabled;return o;}));
  if(selected !== undefined && [...element.options].some(o=>o.value===String(selected))) element.value=String(selected);
}

function selectSchool(id, programId) {
  state.school = state.data.institutions.find(s=>s.id===id);
  $('school').value=id;
  const programs = programsFor(id);
  const credentials=[...new Set(programs.map(p=>p.credential))].sort((a,b)=>a-b);
  const chosen=programs.find(p=>p.id===programId);
  const defaultCredential=chosen?.credential || 0;
  options($('credential'),[{value:0,text:'Overall (undergraduate)'},...credentials.map(c=>({value:c,text:credentialNames[c]||`Credential ${c}`}))],defaultCredential);
  $('credential').disabled=!credentials.length;
  state.showAll=false;
  selectCredential(defaultCredential, programId);
}

function selectCredential(credential, programId) {
  $('credential').value=String(credential);
  const overall=overallPath(state.school);
  const choices=programsFor(state.school.id).filter(p=>Number(credential)===0?p.credential<=3:p.credential===Number(credential)).sort(sortField);
  options($('program'),[{value:overall.id,text:'Overall — all fields of study'},...choices.map(p=>({value:p.id,text:`${label(p)}${Number(credential)===0?` · ${credentialNames[p.credential]}`:''}${p.earnings===null?' — earnings not reported':''}`}))],programId || (Number(credential)===0?overall.id:choices.find(p=>p.earnings!==null)?.id || choices[0]?.id || overall.id));
  $('program').disabled=false;
  state.showAll=false;
  selectProgram($('program').value);
}

function selectProgram(id) {
  const overall=overallPath(state.school);
  const selected=id===overall.id?overall:programsFor(state.school.id).find(p=>p.id===id);
  if(!selected){clearResult('This selection is unavailable. Choose an institution or field of study.');return;}
  if(Number($('credential').value)!==selected.credential){selectCredential(selected.credential,id);return;}
  state.program=selected;
  $('program').value=id;
  populateBaselines();
  resetAssumptions();
  renderPrograms();
}

function populateBaselines() {
  const p=state.program;
  const bachelorCandidates=state.data.programs.filter(p=>p.credential===3 && p.earnings!==null && p.operating).sort((a,b)=>{
    const rank=x=>(x.cip===p.cip?0:2)+(belongsToInstitution(x,state.school.id)?0:1);
    return rank(a)-rank(b) || (schoolFor(a)?.name||'').localeCompare(schoolFor(b)?.name||'') || sortField(a,b);
  });
  options($('baseline-program'),[{value:'',text:'Choose a bachelor’s program'},...bachelorCandidates.map(b=>({value:b.id,text:`${b.cip===p.cip?'Same field · ':''}${schoolFor(b)?.name} / ${label(b)} · ${money(b.earnings)}`}))]);
  const match=preferredBaseline(p,state.data.programs);
  if(match) $('baseline-program').value=match.id;
  $('baseline-mode').value=p.credential>3?'bachelor':'hs';
  [...$('baseline-mode').options].find(o=>o.value==='hs').disabled=p.credential>3;
  $('baseline-custom').value='';
}

function resetAssumptions() {
  const p=state.program;
  if(!p)return;
  $('study-years').value=defaultStudyYears(p,state.school);
  $('work-years').value=40;
  $('annual-cost').value=p.credential<=3 && state.school.tuitionInState!==null?state.school.tuitionInState:'';
  $('annual-cost-range').value=$('annual-cost').value||0;
  $('study-earnings').value=0;
  $('benefit-share').value=100;
  $('growth-rate').value=0;
  $('discount-rate').value=3;
  state.scenario='Default assumptions';
  render();
}

function getBaseline() {
  const mode=$('baseline-mode').value;
  if(mode==='hs')return {value:state.school.highSchoolEarnings,label:'Arkansas high school graduates',note:'State residents ages 25–34 with earnings, not enrolled. Median annual earnings in 2024 dollars.',kind:'Scorecard EARN_THR_STATE'};
  if(mode==='bachelor'){
    const b=state.data.programs.find(p=>p.id===$('baseline-program').value);
    return b?{value:b.earnings,label:`${schoolFor(b)?.name} / ${label(b)}`,note:`Bachelor’s median earnings four years after completion. This is not the same person’s earnings before further study.${!isOverall(state.program)&&b.cip!==state.program.cip?' The comparison program is in a different field.':''}`,kind:`Scorecard EARN_MDN_4YR; ${b.id}`}:{value:null,label:'Choose a bachelor’s program',note:'Choose a comparison when no bachelor’s earnings are reported for the same institution and field.',kind:'unselected'};
  }
  return {value:readNumber('baseline-custom'),label:'Custom comparison earnings',note:'Enter annual earnings in 2024 dollars. This is a scenario assumption, not an observed value.',kind:'user assumption'};
}

function renderLabels() {
  $('study-years-value').value=`${$('study-years').value} ${Number($('study-years').value)===1?'year':'years'}`;
  $('work-years-value').value=`${$('work-years').value} years`;
  $('benefit-share-value').value=`${$('benefit-share').value}%`;
  $('growth-rate-value').value=`${Number($('growth-rate').value).toFixed(1)}%`;
  $('discount-rate-value').value=`${Number($('discount-rate').value).toFixed(1)}%`;
  $('scenario-label').textContent=state.scenario;
  document.querySelectorAll('input[type=range]').forEach(el=>el.style.setProperty('--progress',`${(Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))*100}%`));
}

function render() {
  if(!state.program)return;
  const p=state.program,s=state.school,b=getBaseline();
  renderLabels();
  $('baseline-program-wrap').hidden=$('baseline-mode').value!=='bachelor';
  $('baseline-custom-wrap').hidden=$('baseline-mode').value!=='custom';
  $('baseline-value').textContent=money(b.value);
  $('baseline-note').textContent=b.note;
  $('selected-title').textContent=label(p);
  $('selected-subtitle').textContent=`${s.name} · ${s.city} · ${credentialLabel(p)}`;
  $('graduate-value').textContent=p.earnings===null?'Not reported':money(p.earnings);
  $('comparison-value').textContent=money(b.value);
  $('comparison-label').textContent=$('baseline-mode').value==='bachelor'?'Selected bachelor’s graduates':b.label;
  const gap=p.earnings!==null && b.value!==null?p.earnings-b.value:null;
  $('premium-value').textContent=money(gap);
  $('premium-label').textContent=$('baseline-mode').value==='custom'?'Gap vs. assumed comparison earnings':'Observed annual earnings gap';
  $('premium-value').classList.toggle('negative',gap!==null&&gap<0);
  const sample=p.earningsCount===null?'not reported':p.earningsCount.toLocaleString();
  $('program-note').textContent=isOverall(p)?`Institution-wide undergraduate completers, across all fields and undergraduate credentials. Earnings sample: ${sample}. Select a field or credential for program-level outcomes.`:`CIP ${p.cip} · ${p.earnings===null?'Returns cannot be calculated because earnings are not reported.':`Earnings sample: ${sample}. These data do not indicate current program availability.`}`;
  $('study-note').hidden=!isOverall(p);
  $('study-note').textContent=isOverall(p)?`The ${defaultStudyYears(p,s)}-year default is an editable assumption${[1,2,3].includes(s.predominantCredential)?' based on the institution’s predominant credential':''}, not an observed average across completers.`:'';
  $('earnings-caption').textContent=`${isOverall(p)?'Institution-wide undergraduate median':'Program median'} · 2024 dollars · Completion cohorts: 2017–18 and 2018–19 · Earnings observed: 2022 and 2023.${p.earningsGroupInstitutionIds.length>1?' Outcomes may combine multiple campuses.':''}`;
  $('cost-note').textContent=p.credential<=3?
    `Reference: undergraduate in-state tuition ${money(s.tuitionInState)} (2025–26). The default assumes this same amount as an incremental cost in 2024 dollars, without inflation adjustment. Adjust for grants, materials, and additional living costs.${s.netPrice!==null?` Net price of ${money(s.netPrice)} (2024–25, including living costs) is for reference only.`:''}`:
    'Enter your incremental out-of-pocket graduate study cost in 2024 dollars. Undergraduate tuition and net price are not substitutes. Enter 0 if grants or other support cover all incremental costs.';

  if(p.earnings===null){clearResult(isOverall(p)?'Overall undergraduate earnings are not reported for this institution. Choose another institution or a field with reported earnings.':'Earnings four years after completion are not reported for this program. Choose a program with reported earnings to calculate returns.');return;}
  if(b.value===null){clearResult('Choose a bachelor’s comparison program or enter custom comparison earnings.');return;}
  if(readNumber('annual-cost')===null){clearResult('Enter your annual incremental cost to calculate returns.');return;}
  if(readNumber('study-earnings')===null){clearResult('Enter annual earnings during study. Enter 0 if you expect no earnings.');return;}
  const invalid=['annual-cost','baseline-custom','study-earnings'].find(id=>!$(id).closest('[hidden]') && !$(id).checkValidity());
  if(invalid){clearResult('Check the cost and earnings inputs. Costs cannot be negative, and earnings cannot be blank.');return;}
  try{
    const result=calculateReturns({baselineEarnings:b.value,graduateEarnings:p.earnings,studyYears:Number($('study-years').value),annualCost:readNumber('annual-cost'),inStudyEarnings:readNumber('study-earnings'),workYears:Number($('work-years').value),growthRate:Number($('growth-rate').value)/100,discountRate:Number($('discount-rate').value)/100,benefitShare:Number($('benefit-share').value)/100});
    state.result=result;
    $('shortcut-value').textContent=percent(result.shortcut);
    $('irr-value').textContent=percent(result.irr);
    $('npv-value').textContent=money(result.npv);
    $('irr-value').classList.toggle('negative',result.irr!==null && result.irr<0);
    $('npv-value').classList.toggle('negative',result.npv<0);
    $('npv-label').textContent=`NPV at a ${Number($('discount-rate').value)}% real discount rate`;
    $('investment-detail').textContent=`Total investment ${money(result.investment)} (undiscounted)`;
    $('shortcut-detail').textContent=`Modeled initial earnings gap: ${money(result.annualPremium)}`;
    $('irr-detail').textContent=result.irr===null?reasonText(result.irrReason):`${result.inputs.studyYears} ${result.inputs.studyYears===1?'year':'years'} of study + ${result.inputs.workYears} years of work`;
    const warnings=[];
    if(result.annualPremium<=0)warnings.push('The modeled earnings gap is zero or negative. A conventional investment IRR is not shown.');
    if(result.investment<=0)warnings.push('Earnings during study offset costs and forgone earnings. A conventional investment return is undefined.');
    $('scenario-message').hidden=!warnings.length;
    $('scenario-message').textContent=warnings.join(' ');
    $('download').disabled=false;
    renderChart(result);
    renderSensitivity(result);
  }catch(error){clearResult('Check your inputs. '+error.message);}
}

function reasonText(reason) {
  return ({'no-investment':'No positive net investment','no-benefit':'IRR is undefined without positive benefits','all-zero':'Costs and benefits are both zero','multiple-sign-changes':'A unique IRR is not guaranteed','nonstandard-cashflows':'Nonstandard investment cash flows','outside-numerical-range':'Outside the numerical calculation range'})[reason]||'Cannot calculate under these assumptions';
}

function clearResult(message) {
  state.result=null;
  for(const id of ['shortcut-value','irr-value','npv-value']){$(id).textContent='—';$(id).classList.remove('negative');}
  $('shortcut-detail').textContent='Complete the required inputs';
  $('irr-detail').textContent='Complete the required inputs';
  $('investment-detail').textContent='Total investment —';
  $('scenario-message').textContent=message;$('scenario-message').hidden=false;
  $('cashflow-chart').innerHTML='<div class="chart-empty"><span aria-hidden="true">↗</span><p>Complete the inputs to see cash flows over time.</p></div>';
  $('cashflow-chart').setAttribute('aria-label',message);
  $('sensitivity-chart').innerHTML='<p class="field-note">Select an institution or program with reported earnings and enter costs.</p>';
  $('payback-note').textContent='—';$('download').disabled=true;
}

function renderChart(result) {
  const width=Math.max(300,$('cashflow-chart').clientWidth||850),height=width<450?240:300,left=width<450?50:69,right=18,top=22,bottom=43;
  const flows=result.cashflows;
  const values=flows.flatMap(f=>[f.cumulativeNet,f.cumulativeDiscountedNet]);
  let min=Math.min(0,...values),max=Math.max(0,...values);
  if(max-min<1){min=-1;max=1;}
  const pad=(max-min)*0.12;min-=pad;max+=pad;
  const last=flows.at(-1).year;
  const x=v=>left+v/last*(width-left-right);
  const y=v=>top+(max-v)/(max-min)*(height-top-bottom);
  const path=key=>flows.map((f,i)=>`${i?'L':'M'}${x(f.year).toFixed(2)},${y(f[key]).toFixed(2)}`).join(' ');
  const ticks=Array.from({length:5},(_,i)=>min+(max-min)*i/4);
  const tickStep=width<450?20:10;
  const xTicks=[0,...Array.from({length:Math.floor(last/tickStep)},(_,i)=>(i+1)*tickStep)];if(last-xTicks.at(-1)>(width<450?6:3))xTicks.push(last);
  const studyWidth=x(result.inputs.studyYears)-left;
  const svg=`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">Cumulative cash flows</title><desc id="chart-desc">From enrollment to year ${last}. Final undiscounted net value: ${money(result.lifetimeNet)}; discounted net value: ${money(result.npv)}.</desc><rect x="${left}" y="${top}" width="${studyWidth}" height="${height-top-bottom}" fill="#ece5d8" opacity=".55"/>${ticks.map(v=>`<line x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e8e7"/><text x="${left-12}" y="${y(v)+4}" class="axis-label" text-anchor="end">${compact(v)}</text>`).join('')}<line x1="${left}" x2="${width-right}" y1="${y(0)}" y2="${y(0)}" stroke="#aab7b9" stroke-dasharray="4 4"/>${xTicks.map(v=>`<text x="${x(v)}" y="${height-13}" class="axis-label" text-anchor="middle">${v}</text>`).join('')}<text x="${left+7}" y="${top+16}" class="axis-label">Study</text><path d="${path('cumulativeNet')}" fill="none" stroke="#172b3a" stroke-width="3" stroke-linejoin="round"/><path d="${path('cumulativeDiscountedNet')}" fill="none" stroke="#4c7c66" stroke-width="2.5" stroke-dasharray="6 4" stroke-linejoin="round"/><circle cx="${x(last)}" cy="${y(result.lifetimeNet)}" r="4" fill="#172b3a"/><circle cx="${x(last)}" cy="${y(result.npv)}" r="4" fill="#4c7c66"/></svg>`;
  $('cashflow-chart').innerHTML=svg;
  $('cashflow-chart').setAttribute('aria-label',`Cumulative net cash flows through year ${last} after enrollment. Final undiscounted value: ${money(result.lifetimeNet)}; discounted value: ${money(result.npv)}.`);
  $('payback-note').textContent=result.investment<=0?'No positive investment to recover':result.paybackYears===null?'Investment is not recovered within the working horizon':`Payback: year ${result.paybackYears} after enrollment (undiscounted)${result.discountedPaybackYears===null?' / No discounted payback within the horizon':` / Discounted: year ${result.discountedPaybackYears}`}`;
}

function renderSensitivity(result) {
  const entries=[25,50,75,100].map(share=>({share,value:calculateReturns({...result.inputs,benefitShare:share/100}).irr}));
  const max=Math.max(.01,...entries.filter(e=>e.value!==null).map(e=>Math.abs(e.value)));
  $('sensitivity-chart').innerHTML=entries.map(e=>`<div class="sensitivity-row${e.share===Number($('benefit-share').value)?' active':''}"><span class="sensitivity-label">${e.share}% of gap</span><div class="sensitivity-track"><div class="sensitivity-fill${e.value!==null&&e.value<0?' negative':''}" style="width:${e.value===null?0:Math.max(2,Math.abs(e.value)/max*100)}%"></div></div><strong class="sensitivity-value">${percent(e.value)}</strong></div>`).join('');
}

function renderPrograms() {
  const list=programsFor(state.school.id).filter(p=>isOverall(state.program)?p.credential<=3:p.credential===state.program.credential).sort((a,b)=>(b.earnings??-Infinity)-(a.earnings??-Infinity)||sortField(a,b));
  const shown=state.showAll?list:list.slice(0,6);
  $('programs-title').textContent=isOverall(state.program)?'Undergraduate programs at this institution':'Programs at this institution';
  $('programs-count').textContent=`${list.length} programs · ${list.filter(p=>p.earnings!==null).length} with reported earnings`;
  $('programs-table').innerHTML=shown.length?shown.map(p=>`<tr${p.id===state.program.id?' class="selected"':''}><td>${escape(label(p))}<small>CIP ${escape(p.cip)}</small></td><td>${escape(credentialNames[p.credential])}</td><td>${p.earnings===null?'<span class="muted">Not reported</span>':money(p.earnings)}</td><td><button type="button" class="table-select" data-program="${escape(p.id)}" aria-label="Select ${escape(label(p))}, ${escape(credentialNames[p.credential])}">${p.id===state.program.id?'Selected':'Explore'} <span aria-hidden="true">↗</span></button></td></tr>`).join(''):'<tr><td colspan="4">No field-of-study records are available for this institution.</td></tr>';
  $('show-programs').hidden=list.length<=6;
  $('show-programs').textContent=state.showAll?'Show 6 programs':`View all ${list.length} programs`;
}

function downloadScenario() {
  if(!state.result)return;
  const r=state.result,b=getBaseline(),p=state.program;
  const rows=[['Arkansas Education Returns - scenario export'],['Release',state.data.metadata.release],['Source',state.data.metadata.sourceUrls.data],['Institution',state.school.name],['UNITID',state.school.id],['OPEID6',state.school.opeid6],['Earnings group UNITIDs',p.earningsGroupInstitutionIds.join('; ')],['Earnings group states',p.earningsGroupStates.join('; ')],['Aggregation',isOverall(p)?state.data.metadata.overallEarningsAggregation:state.data.metadata.aggregation],['Selection',label(p)],['Outcome scope',isOverall(p)?'Institution-wide undergraduate completers, all fields and undergraduate credentials':'Field of study and credential'],['Earnings source field',isOverall(p)?'MD_EARN_WNE_4YR':'EARN_MDN_4YR'],['CIP',p.cip],['Credential',credentialLabel(p)],['Earnings unit','Median annual earnings; 2024 USD'],['Selected outcome earnings',p.earnings],['Selected outcome earnings N',p.earningsCount],['Completion cohorts',(isOverall(p)?state.data.metadata.overallEarningsCompletionCohorts:state.data.metadata.earningsCompletionCohorts).join('; ')],['Observation years',(isOverall(p)?state.data.metadata.overallEarningsObservationYears:state.data.metadata.earningsObservationYears).join('; ')],['Comparison',b.label],['Comparison source',b.kind],['Annual cost assumption','2024 USD; tuition reference has not been inflation-adjusted'],['Tuition reference AY2025-26',state.school.tuitionInState],...Object.entries(r.inputs),['Shortcut rate (decimal)',r.shortcut],['Cash-flow IRR (decimal)',r.irr],['IRR status',r.irrReason||'defined'],['NPV',r.npv],['Payback years',r.paybackYears],['Timing',r.timing],['Interpretation','Descriptive median-based scenario, not a causal estimate; conditional on completion and earnings.'],[],['year','phase','study_cost','earnings_difference','net','discounted_net','cumulative_net','cumulative_discounted_net'],...r.cashflows.map(f=>[f.year,f.phase,f.cost,f.benefit,f.net,f.discountedNet,f.cumulativeNet,f.cumulativeDiscountedNet])];
  const cell=value=>{let s=value===null||value===undefined?'':String(value);if(typeof value==='string'&&/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`arkansas-returns-${p.id.replaceAll(':','-')}.csv`;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}

function bindEvents() {
  $('school').addEventListener('change',()=>selectSchool($('school').value));
  $('credential').addEventListener('change',()=>selectCredential($('credential').value));
  $('program').addEventListener('change',()=>selectProgram($('program').value));
  for(const id of ['baseline-mode','baseline-program'])$(id).addEventListener('change',()=>{state.scenario='Custom assumptions';render();});
  for(const id of ['baseline-custom','annual-cost','study-years','work-years','study-earnings','benefit-share','growth-rate','discount-rate'])$(id).addEventListener('input',()=>{if(id==='annual-cost')$('annual-cost-range').value=$('annual-cost').value||0;state.scenario='Custom assumptions';render();});
  $('annual-cost-range').addEventListener('input',()=>{$('annual-cost').value=$('annual-cost-range').value;state.scenario='Custom assumptions';render();});
  $('reset').addEventListener('click',()=>{populateBaselines();resetAssumptions();});
  $('half-premium').addEventListener('click',()=>{$('benefit-share').value=50;state.scenario='50% of earnings gap';render();});
  $('extra-year').addEventListener('click',()=>{$('study-years').value=Math.min(10,Number($('study-years').value)+1);state.scenario='Longer study period';render();});
  $('show-programs').addEventListener('click',()=>{state.showAll=!state.showAll;renderPrograms();});
  $('programs-table').addEventListener('click',event=>{const button=event.target.closest('[data-program]');if(button){selectProgram(button.dataset.program);$('calculator').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}});
  $('download').addEventListener('click',downloadScenario);
  let resizePending=false;
  window.addEventListener('resize',()=>{if(resizePending)return;resizePending=true;requestAnimationFrame(()=>{resizePending=false;if(state.result)renderChart(state.result);});});
}

async function init() {
  try{
    const response=await fetch('./data/scorecard-ar.json?v=20261102-overall');
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    state.data=await response.json();
    if(!state.data.institutions?.length||!Array.isArray(state.data.programs))throw new Error('The dataset is empty');
    const schools=state.data.institutions.filter(s=>s.operating).sort((a,b)=>a.name.localeCompare(b.name));
    options($('school'),schools.map(s=>({value:s.id,text:`${s.name} · ${s.city}`})));
    $('school').disabled=false;
    const initial=initialPath(schools);
    if(!initial)throw new Error('No operating institutions are available');
    bindEvents();selectSchool(initial.institutionId,initial.id);
    const count=state.data.metadata.counts;
    $('data-summary').textContent=`${schools.length} institutions · ${schools.filter(s=>s.overallEarnings!==null&&s.overallEarnings!==undefined).length} reported overall outcomes · ${count.operatingProgramsWithEarnings} program outcomes`;
    $('release-note').textContent=`Official data release: ${state.data.metadata.release} · Retrieved: ${state.data.metadata.retrievedAt.slice(0,10)}. Earnings are in 2024 dollars. Reference tuition is reported for 2025–26; net price is reported for 2024–25.`;
    $('calculator').setAttribute('aria-busy','false');
  }catch(error){
    $('load-error').hidden=false;$('load-error').textContent='Unable to load the data. Reload this page. For a local copy, open it through an HTTP server.';
    $('selected-title').textContent='Data could not be loaded';$('data-summary').textContent='Data not loaded';$('calculator').setAttribute('aria-busy','false');
    console.error('Scorecard data load failed:',error);
  }
}
init();

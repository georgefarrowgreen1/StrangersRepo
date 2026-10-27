// Kitchen Diary page logic. Talks to its data only through window.claude (claude-shim.js).
const ALLERGENS=["Celery","Cereals with gluten","Crustaceans","Eggs","Fish","Lupin","Milk","Molluscs","Mustard","Tree nuts","Peanuts","Sesame","Soya","Sulphites"];
const DEFAULT_SETTINGS={
  units:[{id:"u1",name:"Fridge 1",kind:"fridge"},{id:"u2",name:"Freezer 1",kind:"freezer"}],
  opening:[
    {id:"o1",t:"Fridges, chilled displays and freezers working properly"},
    {id:"o2",t:"Other equipment (coffee machine, ovens, dishwasher) working properly"},
    {id:"o3",t:"Staff fit for work and wearing clean work clothes"},
    {id:"o4",t:"Food preparation areas clean and disinfected"},
    {id:"o5",t:"No evidence of pests"},
    {id:"o6",t:"Handwash basins stocked with soap and paper towels; hot water at all sinks"},
    {id:"o7",t:"Allergen information accurate for everything on sale today"},
    {id:"o8",t:"Probe thermometer working and clean"}],
  closing:[
    {id:"c1",t:"Food past its use-by date thrown away"},
    {id:"c2",t:"Food in fridges covered, labelled and dated"},
    {id:"c3",t:"Food preparation areas cleaned and disinfected"},
    {id:"c4",t:"Equipment and utensils cleaned (including milk jugs and steam wand)"},
    {id:"c5",t:"Waste removed and new bin bags in place"},
    {id:"c6",t:"Dirty cloths and aprons removed for washing"},
    {id:"c7",t:"Floors swept and mopped"},
    {id:"c8",t:"Allergen information updated for tomorrow's items"}],
  weekly:[]
};
const FREQ={"after use":0,"daily":1,"weekly":7,"fortnightly":14,"monthly":30,"quarterly":91,"yearly":365};
const PROVE={
  cook:{label:"Cooking – core temperature",min:75,hint:"Pass at 75°C or hotter in the thickest part."},
  reheat:{label:"Reheating – core temperature",min:75,hint:"Pass at 75°C or hotter, steaming hot all the way through."},
  hold:{label:"Hot holding",min:63,hint:"Pass at 63°C or hotter."},
  chill:{label:"Chilled food or display",max:8,hint:"Pass at 8°C or colder (5°C or colder recommended)."},
  cool:{label:"Cooling – minutes to below 8°C",unit:"min",max:90,hint:"Record the minutes it took to get below 8°C. Pass within 90 minutes."},
  delivChill:{label:"Delivery – chilled",max:8,hint:"Pass at 8°C or colder. Reject anything warmer."},
  delivFrozen:{label:"Delivery – frozen",max:-15,hint:"Pass at −15°C or colder. Reject anything warmer."},
  probeIce:{label:"Probe check – iced water",min:-1,max:1,hint:"Pass between −1°C and 1°C. Replace or recalibrate the probe if outside."},
  probeBoil:{label:"Probe check – boiling water",min:99,max:101,hint:"Pass between 99°C and 101°C. Replace or recalibrate the probe if outside."},
  other:{label:"Other check",manual:true,hint:"Record the reading if there is one, and choose pass or fail."}};
const TOPICS=[["hygiene","Personal hygiene & handwashing"],["cross","Cross-contamination"],["cleaning","Cleaning"],["chilling","Chilling"],["cooking","Cooking & reheating"],["allergens","Allergens"],["diary","Opening & closing checks"],["l2","Level 2 Food Hygiene certificate"]];
const REVIEW_QS=[
  ["problems","Were there any problems recorded in the diary this period?"],
  ["supplier","Have you started using a new supplier or new types of food?"],
  ["menu","Have you added new menu items, recipes or ways of working?"],
  ["equipment","Have you got new equipment, or has any broken down?"],
  ["staff","Have new staff started, and have they been trained on the safe methods?"],
  ["allergen","Has any allergen information changed?"],
  ["pests","Any signs of pests?"],
  ["methods","Have you updated your safe methods to reflect any changes?"]];
/* Sites. The Roastery's records live at the original top-level paths (they were recorded before sites existed);
   every other site keeps its own copy of each collection under sites/<id>/. */
const SITES=[
  {id:"roastery",name:"Roastery",addr:"10 Dove Street, Norwich, NR2 1DE",legacy:true},
  {id:"cafe",name:"Cafe",addr:"21 Pottergate, Norwich, NR2 1DS"},
  {id:"asg",name:"ASG",addr:"14 All Saints Green, Norwich, NR1 3NA"},
  {id:"factory",name:"Factory",addr:"122 Ber Street, Norwich, NR1 3ES"}];
const siteOf=id=>SITES.find(s=>s.id===id)||SITES[0];
const OPT_TABS=[["week","End of week"],["extras","Extra checks"],["cleaning","Cleaning schedule"],["prove","Prove it"],["allergens","Allergens"],["eho","EHO inspection"],["plans","HACCP & risk"],["suppliers","Suppliers"],["contacts","Contacts"],["staff","Staff training"],["onboarding","Onboarding"],["review","4-weekly review"]];
const WEEKDAYS=[[1,"Monday"],[2,"Tuesday"],[3,"Wednesday"],[4,"Thursday"],[5,"Friday"],[6,"Saturday"],[0,"Sunday"]];
const LISTS=[["opening","Opening"],["closing","Closing"],["weekly","End-of-week"]];

const $=s=>document.querySelector(s);
const el=(t,a={},...kids)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a)){if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else if(k==="value")e.value=v;else if(v!==false&&v!=null)e.setAttribute(k,v===true?"":v)}for(const k of kids)if(k!=null)e.append(k);return e};
const pad=n=>String(n).padStart(2,"0");
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse=s=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
const today=()=>iso(new Date());
const monday=s=>addDays(s,-((parse(s).getDay()+6)%7));
const nice=s=>s?parse(s).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"}):"";
const short=s=>s?parse(s).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"}):"";
const time=ts=>ts?new Date(ts).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):"";
const when=ts=>ts?new Date(ts).toLocaleDateString("en-GB",{day:"numeric",month:"short"})+" "+time(ts):"";
function toast(m){const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2400)}

const S={site:(()=>{try{const s=localStorage.getItem("sfbb.site");return SITES.some(x=>x.id===s)?s:"roastery"}catch(e){return"roastery"}})(),
  cfg:null,sum:{},subs:[],allergenDocs:[],assets:null,shared:null,
  db:null,user:null,me:null,canWrite:true,settings:DEFAULT_SETTINGS,days:{},weeks:{},allergens:[],reviews:[],extras:[],cleaning:[],suppliers:[],contacts:[],plans:[],plan:null,onboarding:[],onb:null,inspections:[],insp:null,sample:undefined,staff:[],prove:[],
  date:today(),week:monday(today()),editAlg:null,editStaff:null,names:{},rev:{}};
S.role="staff";S.myName="";
const ro=()=>!S.canWrite||!S.db;

/* ---------- sites & per-site paths ---------- */
const path=(name,site)=>{site=site||S.site;return siteOf(site).legacy?name:`sites/${site}/${name}`};
const C=(name,site)=>S.db.collection(path(name,site));
const D=(name,id,site)=>S.db.doc(path(name,site)+"/"+id);
const curSite=()=>siteOf(S.site);
const siteAddr=(id,s)=>((s&&s.info&&s.info.address)||siteOf(id).addr);
function normSettings(raw){
  const s={...DEFAULT_SETTINGS,...(raw||{})};
  s.units=Array.isArray(s.units)?s.units:[];
  for(const[k]of LISTS)s[k]=Array.isArray(s[k])?s[k].filter(c=>c&&c.id&&c.t):[];
  s.closedDays=Array.isArray(s.closedDays)?s.closedDays:[];
  s.hide=s.hide&&typeof s.hide==="object"?s.hide:{};
  s.proveOff=Array.isArray(s.proveOff)?s.proveOff:[];
  s.info=s.info&&typeof s.info==="object"?s.info:{};
  s.fresh=!raw;
  return s;
}
const activeCfg=s=>({...s,opening:s.opening.filter(c=>!c.off),closing:s.closing.filter(c=>!c.off),weekly:s.weekly.filter(c=>!c.off)});
const isClosed=(date,s)=>(s||S.settings).closedDays.includes(parse(date).getDay());
const tabOn=(t,s)=>!(s||S.settings).hide[t];
S.settings=normSettings(null);S.cfg=activeCfg(S.settings);

/* ---------- rules ---------- */
function tempState(kind,v){
  if(v==null||v==="")return "";
  if(kind==="freezer")return v<=-18?"ok":v<=-15?"warn":"bad";
  return v<=5?"ok":v<=8?"warn":"bad";
}
function dayStatus(d,cfg){
  const s=cfg||S.cfg;d=d||{};
  const oi=(d.opening&&d.opening.items)||{},ci=(d.closing&&d.closing.items)||{},tp=d.temps||{};
  const oN=s.opening.filter(c=>oi[c.id]).length,cN=s.closing.filter(c=>ci[c.id]).length;
  let tN=0,issue=false;const tTot=s.units.length;
  for(const u of s.units){const r=tp[u.id]&&tp[u.id].am;if(r&&r.v!=null){tN++;if(tempState(u.kind,r.v)==="bad")issue=true}}
  const part=(n,t)=>t===0?"y":n===0?"":n>=t?"y":"p";
  return{open:part(oN,s.opening.length),temps:issue?"x":part(tN,tTot),close:part(cN,s.closing.length),signed:d.signed?"y":"",issue,
    complete:oN>=s.opening.length&&cN>=s.closing.length&&tN>=tTot&&!!d.signed,any:oN+cN+tN>0||!!d.signed,oN,cN,tN,tTot};
}
function taskState(t){
  const days=FREQ[t.freq];
  const base=t.lastAt||t.importedAt;
  if(!base)return{cls:"warn",text:"Not done yet",overdue:days>0};
  if(!days)return t.lastAt?{cls:"ok",text:"Last done "+when(t.lastAt),overdue:false}:{cls:"warn",text:"Not done yet",overdue:false};
  const due=new Date(base);due.setHours(0,0,0,0);due.setDate(due.getDate()+days);
  const now=new Date();now.setHours(0,0,0,0);
  const left=Math.round((due-now)/864e5),pre=t.lastAt?"":"Not done yet · ";
  if(left<0)return{cls:"bad",text:`${pre}Overdue by ${-left} day${left===-1?"":"s"}`,overdue:true};
  if(left===0)return{cls:"warn",text:pre+"Due today",overdue:false};
  return{cls:t.lastAt?"ok":"warn",text:`${pre}Due ${due.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`,overdue:false};
}
function proveResult(m,v,manual){
  const r=PROVE[m];if(!r)return null;
  if(r.manual)return manual==="pass";
  if(v==null||!isFinite(v))return null;
  if(r.min!=null&&v<r.min)return false;
  if(r.max!=null&&v>r.max)return false;
  return true;
}

/* ---------- writes ---------- */
let chain=Promise.resolve();
function patchDoc(col,id,patch,exists,base){
  if(ro())return Promise.resolve();
  const ref=D(col,id);
  chain=chain.then(async()=>{
    try{if(exists)await ref.update(patch);else await ref.set(Object.assign({},base||{},patch))}
    catch(e){if(e&&e.code==="invalid_argument"&&!exists){try{await ref.update(patch)}catch(e2){fail(e2)}}else fail(e)}
  });
  return chain;
}
const patchDay=(date,p)=>patchDoc("days",date,p,!!S.days[date],{date});
const patchWeek=(wk,p)=>patchDoc("weeks",wk,p,!!S.weeks[wk],{week:wk});
async function save(fn){if(ro())return false;try{await fn();return true}catch(e){fail(e);return false}}
function fail(e){
  if(e&&e.code==="invalid_argument"){S.canWrite=false;$("#readonly").hidden=false;renderAll();return}
  if(e&&e.code==="quota_exceeded"){toast("The diary is full. Ask the owner to clear old entries.");return}
  toast("Couldn't save. Check your connection and try again.");
}
const stamp=()=>({by:S.me,at:Date.now()});
function armDelete(btn,label,fn){
  btn.addEventListener("click",()=>{
    if(btn.dataset.armed!=="1"){btn.dataset.armed="1";btn.textContent="Tap again to remove";setTimeout(()=>{btn.dataset.armed="";btn.textContent=label},3000);return}
    btn.dataset.armed="";btn.textContent=label;fn();
  });
}

/* ---------- names ---------- */
async function resolveNames(ids){
  ids=[...new Set(ids.filter(Boolean))];
  if(!S.user||!ids.length)return;
  const ps=await S.user.profiles(ids);let changed=false;
  for(const id of ids){const n=(ps[id]&&ps[id].name)||"";if(S.names[id]!==n){S.names[id]=n;changed=true}}
  if(changed)renderAll();
}
const nameOf=id=>id===S.me?"you":(S.names[id]||(String(id||"").startsWith("web:")?String(id).slice(4):"a team member"));

/* ---------- checklist helper ---------- */
function checklist(box,checks,items,prefix,onToggle){
  box.replaceChildren();
  for(const c of checks){
    const id=`${prefix}_${c.id}`;
    const cb=el("input",{type:"checkbox",id,disabled:ro()});cb.checked=!!items[c.id];
    cb.addEventListener("change",()=>onToggle(c.id,cb.checked));
    box.append(el("li",{},el("label",{for:id},cb,el("span",{text:c.t}))));
  }
  if(!checks.length)box.append(el("li",{class:"empty",text:"No checks set up. Add them in Setup."}));
}

/* ---------- daily ---------- */
function renderDay(){
  const ae=document.activeElement,keep=ae&&ae.id&&ae.closest&&ae.closest("#units")?{id:ae.id,v:ae.value}:null;
  try{renderDayInner()}finally{if(keep){const n=document.getElementById(keep.id);if(n){n.value=keep.v;n.focus()}}}
}
function renderDayInner(){
  const d=S.days[S.date]||{},s=S.cfg;
  $("#dayDate").value=S.date;
  const st=dayStatus(d);
  const cn=$("#closedNote");cn.hidden=!isClosed(S.date);cn.textContent=`${curSite().name} is set as closed on ${parse(S.date).toLocaleDateString("en-GB",{weekday:"long"})}s. You can still record checks if it opened.`;
  const info=S.settings.info||{};
  $("#siteNotePanel").hidden=!info.note;$("#siteNoteTitle").textContent=`${curSite().name} notes`;
  $("#siteNote").replaceChildren(renderBody(info.note||""));
  $("#tempsPanel").hidden=!s.units.length&&!S.settings.fresh;
  const mk=(lbl,state)=>el("span",{class:"pill "+(state==="y"?"ok":state==="x"?"bad":state==="p"?"warn":"")},lbl);
  $("#dayPills").replaceChildren(mk(`Opening ${st.oN}/${s.opening.length}`,st.open),mk(`Temps ${st.tN}/${st.tTot}`,st.temps),mk(`Closing ${st.cN}/${s.closing.length}`,st.close),mk(d.signed?"Signed":"Not signed",st.signed));
  const units=$("#units");units.replaceChildren();const ids=[];
  for(const u of s.units){
    const r=d.temps&&d.temps[u.id]&&d.temps[u.id].am;const v=r&&r.v!=null?r.v:"";if(r)ids.push(r.by);
    const id=`t_${u.id}`;
    const inp=el("input",{type:"number",step:"0.1",inputmode:"decimal",id,value:v,placeholder:"°C",disabled:ro(),"aria-label":`${u.name} temperature °C`});
    const box=el("div",{class:"read "+tempState(u.kind,v===""?null:v)},el("label",{class:"label",for:id,text:"Reading °C"}),inp,el("span",{class:"by",text:r?`${time(r.at)} · ${nameOf(r.by)}`:""}));
    inp.addEventListener("input",()=>{box.className="read "+tempState(u.kind,inp.value===""?null:Number(inp.value))});
    inp.addEventListener("change",()=>{
      const raw=inp.value.trim();const val=raw===""?null:Math.round(Number(raw)*10)/10;
      if(raw!==""&&!isFinite(val))return;
      patchDay(S.date,{temps:{[u.id]:{am:val==null?null:{v:val,...stamp()}}}});
      if(tempState(u.kind,val)==="bad")toast(`${u.name} is out of range. Note what you did under Problems.`);
    });
    units.append(el("div",{class:"unit"},el("div",{class:"row spread"},el("h3",{text:u.name}),el("span",{class:"lim",text:u.kind==="freezer"?"−18°C or colder":"5°C or below"})),box));
  }
  if(!s.units.length)units.append(el("div",{class:"empty",text:"No fridges or freezers set up yet. Add them in Setup."}));
  for(const[key,list,sel,bySel,word]of[["opening",s.opening,"#openList","#openBy","opening"],["closing",s.closing,"#closeList","#closeBy","closing"]]){
    const part=d[key]||{};const items=part.items||{};
    checklist($(sel),list,items,key,(cid,v)=>patchDay(S.date,{[key]:{items:{[cid]:v},...stamp(),...(v?{}:{allDone:null})}}));
    if(part.by)ids.push(part.by);
    $(bySel).textContent=part.at?`Last ticked ${time(part.at)} by ${nameOf(part.by)}`:"";
    const all=list.length>0&&list.every(c=>items[c.id]);
    const id="all_"+key;
    const cb=el("input",{type:"checkbox",id,disabled:ro()||!list.length});cb.checked=all;
    cb.addEventListener("change",()=>{
      const set={};for(const c of list)set[c.id]=cb.checked;
      patchDay(S.date,{[key]:{items:set,...stamp(),allDone:cb.checked?stamp():null}});
      if(cb.checked)toast(`All ${word} checks marked complete`);
    });
    if(part.allDone&&part.allDone.by)ids.push(part.allDone.by);
    const who=all&&part.allDone?`Confirmed by ${nameOf(part.allDone.by)} at ${time(part.allDone.at)}`:all?"Every check ticked":`${list.filter(c=>items[c.id]).length} of ${list.length} ticked`;
    $(sel).append(el("li",{class:"alldone"+(all?" on":"")},el("label",{for:id},cb,el("span",{},el("strong",{text:`All ${word} checks completed`}),el("span",{class:"by",text:who})))));
  }
  const pb=$("#problems");if(document.activeElement!==pb)pb.value=(d.problems&&d.problems.text)||"";
  pb.disabled=ro();$("#saveProb").disabled=ro();
  if(d.problems&&d.problems.by)ids.push(d.problems.by);
  $("#probBy").textContent=d.problems&&d.problems.at?`Saved ${time(d.problems.at)} by ${nameOf(d.problems.by)}`:"";
  const sa=$("#signArea");sa.replaceChildren();
  const sn=$("#signName");$("#signNameWrap").hidden=!!d.signed||ro();
  if(document.activeElement!==sn&&!sn.value){try{sn.value=localStorage.getItem("sfbb.signName")||""}catch(e){}}
  if(d.signed){
    ids.push(d.signed.by);
    const who=d.signed.name||nameOf(d.signed.by);
    sa.append(el("span",{class:"pill ok",text:`Signed by ${who} at ${time(d.signed.at)}${d.signed.at&&iso(new Date(d.signed.at))!==S.date?" on "+short(iso(new Date(d.signed.at))):""}`}));
    if(!ro())sa.append(el("button",{class:"btn ghost",onclick:()=>patchDay(S.date,{signed:null})},"Undo sign-off"));
  }else{
    const missing=[];if(st.open!=="y")missing.push("opening checks");if(st.tN<st.tTot)missing.push("temperatures");if(st.close!=="y")missing.push("closing checks");
    const msg=el("span",{class:"by",text:missing.length?"Still to do: "+missing.join(", "):""});
    sa.append(el("button",{class:"btn",disabled:ro(),onclick:()=>{
      const name=sn.value.trim();
      if(!name){msg.textContent="Enter your name to sign off.";sn.focus();return}
      try{localStorage.setItem("sfbb.signName",name)}catch(e){}
      patchDay(S.date,{signed:{...stamp(),name}});
    }},S.date===today()?"Sign off today":"Sign off "+nice(S.date)),msg);
  }
  resolveNames(ids);
}

/* ---------- week ---------- */
function renderWeek(){
  const wk=S.week,w=S.weeks[wk]||{},list=S.cfg.weekly||[],items=w.items||{};
  $("#wkLabel").textContent=`Week of ${nice(wk)} – ${nice(addDays(wk,6))}`;
  const n=list.filter(c=>items[c.id]).length;
  const p=$("#wkPill");p.textContent=w.signed?"Signed":`${n}/${list.length} done`;p.className="pill "+(w.signed?"ok":n?"warn":"");
  checklist($("#wkList"),list,items,"wk",(cid,v)=>patchWeek(wk,{items:{[cid]:v},...stamp()}));
  $("#wkBy").textContent=w.at?`Last ticked ${when(w.at)} by ${nameOf(w.by)}`:"";
  const nt=$("#wkNotes");if(document.activeElement!==nt)nt.value=(w.notes&&w.notes.text)||"";
  nt.disabled=ro();$("#wkSaveNote").disabled=ro();
  $("#wkNoteBy").textContent=w.notes&&w.notes.at?`Saved ${when(w.notes.at)} by ${nameOf(w.notes.by)}`:"";
  const sa=$("#wkSign");sa.replaceChildren();
  const sn=$("#wkSignName");$("#wkSignNameWrap").hidden=!!w.signed||ro();
  if(document.activeElement!==sn&&!sn.value){try{sn.value=localStorage.getItem("sfbb.signName")||""}catch(e){}}
  if(w.signed){
    sa.append(el("span",{class:"pill ok",text:`Signed by ${w.signed.name||nameOf(w.signed.by)} on ${when(w.signed.at)}`}));
    if(!ro())sa.append(el("button",{class:"btn ghost",onclick:()=>patchWeek(wk,{signed:null})},"Undo sign-off"));
  }else{
    const msg=el("span",{class:"by",text:n<list.length?`${list.length-n} check${list.length-n===1?"":"s"} still to do`:""});
    sa.append(el("button",{class:"btn",disabled:ro(),onclick:()=>{
      const name=sn.value.trim();
      if(!name){msg.textContent="Enter your name to sign off.";sn.focus();return}
      try{localStorage.setItem("sfbb.signName",name)}catch(e){}
      patchWeek(wk,{signed:{...stamp(),name}});
    }},"Sign off this week"),msg);
  }
  $("#wkNext").disabled=wk>=monday(today());
  resolveNames([w.by,w.signed&&w.signed.by,w.notes&&w.notes.by]);
}

/* ---------- history ---------- */
function renderHistory(){
  const strip=$("#strip");strip.replaceChildren();
  const end=today();let complete=0,trading=0;const exc=[];
  for(let i=27;i>=0;i--){
    const date=addDays(end,-i);const d=S.days[date];const st=dayStatus(d);const shut=isClosed(date)&&!st.any;
    if(!shut){trading++;if(st.complete)complete++}
    const bars=el("div",{class:"bars"});
    for(const k of["open","temps","close","signed"])bars.append(el("i",{class:st[k]}));
    const dd=parse(date);
    strip.append(el("button",{class:"day"+(date===end?" today":"")+(shut?" closed":""),title:nice(date)+(shut?" (closed)":""),onclick:()=>{S.date=date;show("day");renderDay()}},
      el("span",{class:"d",text:dd.toLocaleDateString("en-GB",{weekday:"narrow"})+" "+dd.getDate()}),bars));
    if(d&&d.temps)for(const u of S.settings.units){const r=d.temps[u.id]&&d.temps[u.id].am;if(r&&tempState(u.kind,r.v)==="bad")exc.push([date,`${u.name} reading ${r.v}°C`])}
    if(date<end&&!st.complete&&!shut)exc.push([date,st.any?"Diary not completed":"No diary entry"]);
    if(d&&d.problems&&d.problems.text)exc.push([date,"Note: "+d.problems.text]);
  }
  const sc=$("#histScore");sc.textContent=`${complete} of ${trading} trading days complete`;sc.className="pill "+(complete>=trading-2?"ok":complete>=trading-8?"warn":"bad");
  const tb=$("#excTable tbody");tb.replaceChildren();
  if(!exc.length)tb.append(el("tr",{},el("td",{colspan:2,text:"Nothing to report."})));
  for(const[date,w]of exc.reverse())tb.append(el("tr",{},el("td",{text:nice(date),style:"white-space:nowrap"}),el("td",{text:w})));
}

/* ---------- task lists (extra checks & cleaning) ---------- */
const TASKS={
  extras:{list:"#xList",form:"#xForm",title:"#xFormTitle",panel:"#xFormPanel",pill:"#xPill",noun:"extra check",
    fields:[["name","Check","text","e.g. Probe thermometer accuracy check"],["how","How to do it","text","e.g. Iced water and boiling water test; record in Prove it"],["freq","How often","freq"],["who","Who does it","text","e.g. Duty manager"]]},
  cleaning:{list:"#kList",form:"#kForm",title:"#kFormTitle",panel:"#kFormPanel",pill:"#kPill",noun:"cleaning task",
    fields:[["name","Item or area","text","e.g. Coffee machine group heads"],["how","How to clean (method & product)","text","e.g. Backflush with cleaning tablet, rinse"],["freq","How often","freq"],["who","Who does it","text","e.g. Closing barista"]]}};
const editing={extras:null,cleaning:null};
function buildTaskForm(kind){
  const cfg=TASKS[kind],box=$(cfg.form);box.replaceChildren();
  const f=el("div",{class:"fields"});
  for(const[k,lbl,type,ph]of cfg.fields){
    const id=`${kind}_f_${k}`;let inp;
    if(type==="freq"){inp=el("select",{id});for(const o of Object.keys(FREQ))inp.append(el("option",{value:o},o[0].toUpperCase()+o.slice(1)));inp.value="weekly"}
    else inp=el("input",{type:"text",id,placeholder:ph});
    f.append(el("div",{class:"field"},el("label",{class:"label",for:id,text:lbl}),inp));
  }
  const msg=el("span",{class:"by"});
  const cancel=el("button",{class:"btn ghost",hidden:true,onclick:()=>editTask(kind,null)},"Cancel edit");
  const del=el("button",{class:"btn ghost danger",hidden:true},"Remove");
  armDelete(del,"Remove",async()=>{if(await save(()=>D(kind,editing[kind]).delete())){editTask(kind,null);toast("Removed")}});
  const saveBtn=el("button",{class:"btn",onclick:async()=>{
    const v={};for(const[k]of cfg.fields)v[k]=$(`#${kind}_f_${k}`).value.trim();
    if(!v.name){msg.textContent="Give it a name first.";return}
    const ok=editing[kind]?await save(()=>D(kind,editing[kind]).update(v)):await save(()=>C(kind).add({...v,createdAt:Date.now()}));
    if(ok){msg.textContent=`Saved ${v.name}.`;editTask(kind,null)}
  }},"Save");
  box.append(f,el("div",{class:"row"},saveBtn,cancel,del,msg));
  box._cancel=cancel;box._del=del;
}
function editTask(kind,t){
  const cfg=TASKS[kind];editing[kind]=t?t.id:null;
  $(cfg.title).textContent=t?"Edit "+t.name:"Add a "+cfg.noun;
  for(const[k,,type]of cfg.fields)$(`#${kind}_f_${k}`).value=t?(t[k]||(type==="freq"?"weekly":"")):(type==="freq"?"weekly":"");
  const box=$(cfg.form);box._cancel.hidden=!t;box._del.hidden=!t;
  if(t)$(cfg.panel).scrollIntoView({behavior:"smooth",block:"start"});
}
function renderTasks(kind){
  const cfg=TASKS[kind],box=$(cfg.list);box.replaceChildren();
  const items=[...S[kind]].sort((a,b)=>(FREQ[a.freq]??99)-(FREQ[b.freq]??99)||a.name.localeCompare(b.name));
  let over=0;const ids=[];
  if(!items.length)box.append(el("div",{class:"empty",text:`Nothing listed yet. Add your first ${cfg.noun} below.`}));
  for(const t of items){
    const st=taskState(t);if(st.overdue)over++;if(t.lastBy)ids.push(t.lastBy);
    const note=el("input",{type:"text",id:`${kind}_n_${t.id}`,placeholder:"Note (optional)",disabled:ro(),"aria-label":"Note for "+t.name});
    const doneBtn=el("button",{class:"btn sm",disabled:ro(),onclick:()=>completeTask(kind,t,S.site,note.value.trim())},"Done");
    const last=t.log&&t.log[0];
    box.append(el("div",{class:"task"},
      el("div",{},el("h3",{text:t.name}),t.how?el("p",{class:"how",text:t.how}):null,
        el("div",{class:"meta"},el("span",{text:(t.freq||"").replace(/^./,c=>c.toUpperCase())}),t.who?el("span",{text:"Who: "+t.who}):null,
          t.lastAt?el("span",{text:`Last: ${when(t.lastAt)} by ${nameOf(t.lastBy)}${last&&last.note?" – "+last.note:""}`}):null)),
      el("div",{class:"act"},el("span",{class:"pill "+st.cls,text:st.text}),ro()?null:el("button",{class:"btn ghost sm",onclick:()=>editTask(kind,t)},"Edit")),
      ro()?null:el("div",{class:"done"},note,doneBtn)));
  }
  const p=$(cfg.pill);p.textContent=over?`${over} overdue`:items.length?"Up to date":"Empty";p.className="pill "+(over?"bad":items.length?"ok":"");
  $(cfg.panel).hidden=ro();
  resolveNames(ids);
  return over;
}

async function completeTask(kind,t,site,note){
  const entry={at:Date.now(),by:S.me,note:note||""};
  const log=[entry,...(t.log||[])].slice(0,30);
  if(await save(()=>D(kind,t.id,site).update({lastAt:entry.at,lastBy:entry.by,log})))toast(`${t.name}: done${site!==S.site?" at "+siteOf(site).name:""}`);
}

/* ---------- prove it ---------- */
function fillProve(){
  const sel=$("#pMethod"),cur=sel.value;sel.replaceChildren();
  for(const[k,r]of Object.entries(PROVE))if(!S.settings.proveOff.includes(k))sel.append(el("option",{value:k},r.label));
  if(!sel.options.length)sel.append(el("option",{value:"other"},PROVE.other.label));
  if([...sel.options].some(o=>o.value===cur))sel.value=cur;
  sel.dispatchEvent(new Event("change"));
}
function proveForm(){
  const sel=$("#pMethod");
  $("#pDate").value=today();
  const upd=()=>{const r=PROVE[sel.value];if(!r)return;$("#pReadLbl").textContent=`Reading (${r.unit||"°C"})`;$("#pHint").textContent=r.hint;$("#pManualWrap").hidden=!r.manual};
  sel.addEventListener("change",upd);fillProve();
  $("#pSave").addEventListener("click",async()=>{
    const m=sel.value,raw=$("#pReading").value.trim(),v=raw===""?null:Number(raw);
    const food=$("#pFood").value.trim();
    if(!food){$("#pMsg").textContent="Say what food or equipment you checked.";return}
    if(!PROVE[m].manual&&(v==null||!isFinite(v))){$("#pMsg").textContent="Enter the reading.";return}
    const pass=proveResult(m,v,$("#pManual").value);
    const rec={date:$("#pDate").value||today(),method:m,food,reading:v,unit:PROVE[m].unit||"°C",pass,action:$("#pAction").value.trim(),by:S.me,at:Date.now()};
    if(await save(()=>C("proveit").add(rec))){
      $("#pMsg").textContent=pass?"Saved: pass.":"Saved: fail. Make sure the action taken is recorded.";
      $("#pFood").value="";$("#pReading").value="";$("#pAction").value="";
    }
  });
}
function renderProve(){
  const box=$("#pList");box.replaceChildren();const ids=[];
  const recs=[...S.prove].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.at||0)-(a.at||0));
  const fails=recs.filter(r=>r.pass===false).length;
  const p=$("#pPill");p.textContent=`${recs.length} record${recs.length===1?"":"s"}${fails?` · ${fails} failed`:""}`;p.className="pill "+(fails?"warn":recs.length?"ok":"");
  if(!recs.length){box.append(el("div",{class:"empty",text:"No Prove it records yet. Start with a probe thermometer check and the core temperature of something you cook or reheat."}))}
  else{
    const tb=el("tbody");
    for(const r of recs){
      ids.push(r.by);
      const rule=PROVE[r.method]||{label:r.method};
      tb.append(el("tr",{},
        el("td",{text:short(r.date),style:"white-space:nowrap"}),
        el("td",{},el("div",{style:"font-weight:600",text:r.food}),el("div",{class:"by",text:rule.label})),
        el("td",{class:"res",text:r.reading==null?"–":`${r.reading}${r.unit==="min"?" min":"°C"}`}),
        el("td",{},el("span",{class:"pill "+(r.pass?"ok":"bad"),text:r.pass?"Pass":"Fail"})),
        el("td",{text:r.action||""}),
        el("td",{class:"by",text:nameOf(r.by)}),
        ro()?el("td"):el("td",{},(()=>{const b=el("button",{class:"btn ghost sm danger"},"Remove");armDelete(b,"Remove",()=>save(()=>D("proveit",r.id).delete()));return b})())));
    }
    box.append(el("div",{class:"scroll"},el("table",{},el("thead",{},el("tr",{},...["Date","Check","Result","","Notes / action","By",""].map(h=>el("th",{text:h})))),tb)));
  }
  $("#pFormPanel").hidden=ro();
  resolveNames(ids);
}

/* ---------- suppliers ---------- */
const SUP_FIELDS=[["name","Supplier name","text","e.g. Green Valley Dairy"],["supplies","What they supply","text","e.g. Milk, cream, butter"],["contact","Contact name","text",""],["phone","Phone","tel",""],["email","Email","email",""],["address","Address","text",""],["rating","Food hygiene rating","text","e.g. 5 (checked Oct 2026)"],["notes","Notes","text","e.g. Delivers Tue & Fri, order by 2pm"]];
let editSup=null;
function supForm(){
  const box=$("#sForm");const f=el("div",{class:"fields"});
  for(const[k,lbl,type,ph]of SUP_FIELDS)f.append(el("div",{class:"field"+(k==="address"||k==="notes"?" wide":"")},el("label",{class:"label",for:"s_"+k,text:lbl}),el("input",{type,id:"s_"+k,placeholder:ph})));
  const msg=el("span",{class:"by"});
  const cancel=el("button",{class:"btn ghost",hidden:true,onclick:()=>editSupplier(null)},"Cancel edit");
  const del=el("button",{class:"btn ghost danger",hidden:true},"Remove supplier");
  armDelete(del,"Remove supplier",async()=>{if(await save(()=>D("suppliers",editSup).delete())){editSupplier(null);toast("Supplier removed")}});
  const saveBtn=el("button",{class:"btn",onclick:async()=>{
    const v={};for(const[k]of SUP_FIELDS)v[k]=$("#s_"+k).value.trim();
    if(!v.name){msg.textContent="Add the supplier's name first.";return}
    v.by=S.me;v.at=Date.now();
    const ok=editSup?await save(()=>D("suppliers",editSup).set(v)):await save(()=>C("suppliers").add(v));
    if(ok){msg.textContent=`Saved ${v.name}.`;editSupplier(null)}
  }},"Save supplier");
  box.append(f,el("div",{class:"row"},saveBtn,cancel,del,msg));box._cancel=cancel;box._del=del;
}
function editSupplier(s){
  editSup=s?s.id:null;$("#sFormTitle").textContent=s?"Edit "+s.name:"Add a supplier";
  for(const[k]of SUP_FIELDS)$("#s_"+k).value=s?(s[k]||""):"";
  $("#sForm")._cancel.hidden=!s;$("#sForm")._del.hidden=!s;
  if(s)$("#sFormPanel").scrollIntoView({behavior:"smooth",block:"start"});
}
function renderSuppliers(){
  const box=$("#sList");box.replaceChildren();
  const list=[...S.suppliers].sort((a,b)=>a.name.localeCompare(b.name));
  const p=$("#sPill");p.textContent=`${list.length} supplier${list.length===1?"":"s"}`;p.className="pill "+(list.length?"ok":"");
  if(!list.length)box.append(el("div",{class:"empty",text:"No suppliers yet. Add your milk, coffee, bakery and any other food or drink suppliers below."}));
  for(const s of list){
    const bits=[s.contact,s.phone,s.email].filter(Boolean).join(" · ");
    box.append(el("div",{class:"card"},
      el("div",{class:"row spread"},el("h3",{text:s.name}),ro()?null:el("button",{class:"btn ghost sm",onclick:()=>editSupplier(s)},"Edit")),
      s.supplies?el("div",{text:s.supplies}):null,
      bits?el("div",{class:"by",text:bits}):null,
      s.address?el("div",{class:"by",text:s.address}):null,
      (s.rating||s.notes)?el("div",{class:"by",text:[s.rating?"Hygiene rating: "+s.rating:"",s.notes].filter(Boolean).join(" · ")}):null));
  }
  $("#sFormPanel").hidden=ro();
}

/* ---------- HACCP plans & risk assessments ---------- */
const PL_COLS={
  haccp:[["step","Process step","w-s"],["hazard","Hazard","w-m"],["hazardType","Type","sel"],["control","Control measure","w-l"],["ccp","CCP","chk"],["criticalLimit","Critical limit","w-m"],["monitoring","Monitoring","w-m"],["correctiveAction","Corrective action","w-l"],["verification","Verification","w-m"],["records","Records","w-s"]],
  risk:[["hazard","Hazard","w-m"],["whoHarmed","Who might be harmed","w-s"],["existingControls","Existing controls","w-l"],["likelihood","Likelihood","num"],["severity","Severity","num"],["_rate","Risk","rate"],["furtherAction","Further action needed","w-l"],["actionBy","By whom","w-s"],["dueDate","Due","date"],["done","Done","chk"]]};
const PL_META={
  haccp:[["scope","Scope (products and processes covered)","text"],["preparedBy","Prepared by","text"],["date","Date written","date"],["reviewDate","Next review","date"]],
  risk:[["area","Area or activity","text"],["assessor","Assessor","text"],["date","Date assessed","date"],["reviewDate","Next review","date"]]};
const HAZ_TYPES=["","Biological","Chemical","Physical","Allergen"];
const PL_NAME={haccp:"HACCP plan",risk:"Risk assessment"};
const rowsKey=k=>k==="haccp"?"steps":"rows";
const clone=x=>{const c=JSON.parse(JSON.stringify(x||{}));delete c.id;return c};
function blankRow(k){return k==="haccp"?{step:"",hazard:"",hazardType:"",control:"",ccp:false,criticalLimit:"",monitoring:"",correctiveAction:"",verification:"",records:""}
  :{hazard:"",whoHarmed:"",existingControls:"",likelihood:0,severity:0,furtherAction:"",actionBy:"",dueDate:"",done:false}}
function riskOf(r){const v=(Number(r.likelihood)||0)*(Number(r.severity)||0);return{v,cls:!v?"":v<=4?"ok":v<=12?"warn":"bad",text:!v?"–":`${v} ${v<=4?"Low":v<=12?"Medium":"High"}`}}
function reviewState(d){
  if(!d.reviewDate)return{cls:"",text:"No review date",overdue:false};
  const left=Math.round((parse(d.reviewDate)-parse(today()))/864e5);
  if(left<0)return{cls:"bad",text:"Review overdue",overdue:true};
  if(left<=14)return{cls:"warn",text:"Review due "+short(d.reviewDate),overdue:false};
  return{cls:"ok",text:"Review "+short(d.reviewDate),overdue:false};
}
function isoDate(v,left){
  v=v==null?"":String(v).trim();if(!v)return"";
  if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;
  const m=v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if(m){const y=m[3].length===2?2000+Number(m[3]):Number(m[3]);const d=new Date(y,Number(m[2])-1,Number(m[1]));if(!isNaN(d))return iso(d)}
  const t=Date.parse(v);if(!isNaN(t)&&/\d{4}/.test(v))return iso(new Date(t));
  left.push(v);return"";
}
function normalizePlan(raw,kind,fname,cut){
  raw=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const k=kind!=="auto"?kind:(raw.type==="risk"?"risk":"haccp");
  const str=v=>v==null?"":String(v).trim();const left=[];
  const d={type:k,title:str(raw.title)||PL_NAME[k]};
  for(const[f,,t]of PL_META[k])d[f]=t==="date"?isoDate(raw[f],left):str(raw[f]);
  const src=Array.isArray(raw[rowsKey(k)])?raw[rowsKey(k)]:Array.isArray(raw.rows)?raw.rows:Array.isArray(raw.steps)?raw.steps:[];
  d[rowsKey(k)]=src.filter(r=>r&&typeof r==="object").map(r=>{
    const b=blankRow(k);
    for(const f of Object.keys(b)){
      if(typeof b[f]==="boolean")b[f]=r[f]===true||r[f]==="true"||r[f]==="Yes"||r[f]==="yes";
      else if(typeof b[f]==="number"){const n=Math.round(Number(r[f]));b[f]=isFinite(n)?Math.max(0,Math.min(5,n)):0}
      else if(f==="dueDate")b[f]=isoDate(r[f],left);
      else if(f==="hazardType"){const h=str(r[f]);b[f]=HAZ_TYPES.find(x=>x&&x.toLowerCase()===h.toLowerCase())||""}
      else b[f]=str(r[f]);
    }
    return b;
  });
  const extra=[str(raw.notes)];
  if(left.length)extra.push("Dates as written in the original: "+left.join("; "));
  if(cut)extra.push("Only the first part of the original was converted because it was very long. Check the rest by hand.");
  d.notes=extra.filter(Boolean).join("\n\n");
  const now=Date.now();
  Object.assign(d,{source:fname,createdBy:S.me,createdAt:now,updatedBy:S.me,updatedAt:now,history:[{by:S.me,at:now,what:"Converted from "+fname}]});
  return d;
}

/* extraction */
const LIBS={
  pdf:["https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js","https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"],
  docx:["https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"],
  xlsx:["https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"]};
const loadedScripts={};
function loadScript(src){
  return loadedScripts[src]||(loadedScripts[src]=new Promise((res,rej)=>{
    const s=document.createElement("script");s.src=src;s.onload=res;
    s.onerror=()=>{delete loadedScripts[src];rej(new Error("Couldn't load the file reader. Check your connection and try again."))};
    document.head.append(s);
  }));
}
async function loadLib(k){for(const s of LIBS[k])await loadScript(s)}
function htmlToText(html){
  const doc=new DOMParser().parseFromString(html,"text/html");
  const cell=c=>c.textContent.replace(/\s+/g," ").trim();
  const walk=n=>{
    if(n.nodeType===3)return n.textContent;
    if(n.nodeType!==1)return"";
    const t=n.tagName;
    if(t==="TABLE")return"\n"+[...n.querySelectorAll("tr")].map(tr=>"| "+[...tr.children].map(cell).join(" | ")+" |").join("\n")+"\n\n";
    const inner=[...n.childNodes].map(walk).join("");
    if(/^H[1-6]$/.test(t))return"\n## "+inner.trim()+"\n";
    if(t==="LI")return"- "+inner.trim()+"\n";
    if(t==="P"||t==="DIV")return inner.trim()+"\n";
    if(t==="BR")return"\n";
    return inner;
  };
  return walk(doc.body).replace(/\n{3,}/g,"\n\n").trim();
}
async function extractFile(file,maxImgs){
  const name=file.name.toLowerCase(),ext=name.split(".").pop();
  if(/^image\//.test(file.type)||["jpg","jpeg","png","webp","gif"].includes(ext))return{images:[file]};
  if(ext==="doc")throw new Error("Older Word .doc files can't be read here. Open it in Word, save it as .docx or PDF, then upload that.");
  if(ext==="pdf"){
    await loadLib("pdf");const lib=window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc=LIBS.pdf[1];
    const pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
    let text="";
    for(let i=1;i<=pdf.numPages;i++){
      const tc=await(await pdf.getPage(i)).getTextContent();
      text+=tc.items.map(it=>(it.str||"")+(it.hasEOL?"\n":" ")).join("")+`\n\n[end of page ${i}]\n\n`;
    }
    if(text.replace(/\[end of page \d+\]|\s/g,"").length>=60*Math.min(pdf.numPages,3))return{text};
    if(!maxImgs)throw new Error("This PDF looks like a scan with no selectable text, and photos can't be converted in this view. Upload a Word or text version instead.");
    const images=[];
    for(let i=1;i<=Math.min(pdf.numPages,maxImgs);i++){
      const page=await pdf.getPage(i);const base=page.getViewport({scale:1});
      const vp=page.getViewport({scale:Math.min(2.5,1600/base.width)});
      const c=document.createElement("canvas");c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);
      await page.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;
      images.push(await new Promise(r=>c.toBlob(r,"image/jpeg",0.85)));
    }
    return{images,pagesSkipped:Math.max(0,pdf.numPages-maxImgs)};
  }
  if(ext==="docx"){
    await loadLib("docx");
    const r=await window.mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()},{convertImage:window.mammoth.images.imgElement(()=>Promise.resolve({src:""}))});
    return{text:htmlToText(r.value)};
  }
  if(ext==="xlsx"||ext==="xls"){
    await loadLib("xlsx");
    const wb=window.XLSX.read(await file.arrayBuffer(),{type:"array"});
    return{text:wb.SheetNames.map(n=>"## Sheet: "+n+"\n"+window.XLSX.utils.sheet_to_csv(wb.Sheets[n],{blankrows:false})).join("\n\n")};
  }
  if(["csv","txt","md","text"].includes(ext)||/^text\//.test(file.type))return{text:await file.text()};
  throw new Error("That file type can't be read. Upload a PDF, Word (.docx), Excel, text file or a photo.");
}
const SHAPES={
  haccp:`{"type":"haccp","title":"string","scope":"products and processes covered","preparedBy":"string","date":"YYYY-MM-DD or as written","reviewDate":"YYYY-MM-DD or as written","steps":[{"step":"process step","hazard":"the hazard","hazardType":"Biological | Chemical | Physical | Allergen | empty string","control":"control measure","ccp":false,"criticalLimit":"string","monitoring":"what is checked, how, when, by whom","correctiveAction":"string","verification":"string","records":"string"}],"notes":"string"}`,
  risk:`{"type":"risk","title":"string","area":"area or activity assessed","assessor":"string","date":"YYYY-MM-DD or as written","reviewDate":"YYYY-MM-DD or as written","rows":[{"hazard":"string","whoHarmed":"who might be harmed and how","existingControls":"string","likelihood":0,"severity":0,"furtherAction":"string","actionBy":"string","dueDate":"YYYY-MM-DD or empty string","done":false}],"notes":"string"}`};
function buildPrompt(kind,fname,text,nImg){
  const which=kind==="auto"
    ?`First decide whether the document is a HACCP plan (process steps, hazards, critical control points, critical limits, monitoring) or a risk assessment (hazards, who might be harmed, risk ratings, controls, actions; for example food safety, fire, COSHH or health and safety). Then reply in the matching shape.\n\nHACCP plan shape:\n${SHAPES.haccp}\n\nRisk assessment shape:\n${SHAPES.risk}`
    :`It is a ${PL_NAME[kind].toLowerCase()}. Reply in this shape:\n${SHAPES[kind]}`;
  return `Convert this document from a UK café's food safety records (Safer Food, Better Business) into structured JSON so it can be shown as an editable table.

Rules:
- Use only what the document says. Do not invent hazards, limits, controls, ratings or dates.
- Keep the document's own wording. Fix only obvious typos and capitalisation.
- Use "" for anything the document doesn't give. Use false for ccp and done, and 0 for likelihood and severity, when not stated.
- HACCP plans: one entry in "steps" per hazard at a step; repeat the step name when a step has several hazards. Set ccp to true only where the document marks a critical control point (CCP).
- Risk ratings use a 1 to 5 scale. If the document uses another scale, convert it (for low/medium/high use 1/3/5) and say so in notes.
- Put anything that doesn't fit the table (sign-offs, general procedures, scope notes) in "notes" as short plain text.
- Write dates as YYYY-MM-DD when a full date is given.

${which}

Reply with only the JSON object.

File name: ${fname}
${nImg?`The document is in the ${nImg} attached image${nImg>1?"s":""}, in page order.`:`Document text:\n"""\n${text}\n"""`}`;
}
function sampleErr(e){
  const c=e&&e.code;
  if(c==="cancelled")return"Stopped.";
  if(["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"].includes(c)){S.sample=null;renderPlansList();renderOnbList();renderInspList();return"Claude isn't available to this page, so files can't be converted. You can still start from a template."}
  if(c==="rate_limited")return"Too many requests, or your Claude usage limit has been reached. Try again later.";
  if(c==="prompt_too_large")return"That document is too long to convert in one go. Upload just the HACCP or risk assessment pages.";
  if(c==="image_rejected"||c==="images_unavailable")return"That image couldn't be read. Try a clearer JPEG or PNG photo, or a PDF.";
  if(c==="session_expired")return"Sign in to Claude again, then try again.";
  if(c==="invalid_json"||c==="empty_completion"||c==="refused")return"Claude couldn't turn that into a table. Try again, or choose the document type yourself.";
  return"Something went wrong while converting. Try again.";
}
let plFile=null,plCtl=null;
function plStatus(t){$("#plStatus").textContent=t}
function setPlFile(f){
  plFile=f||null;
  $("#plDropText").textContent=plFile?plFile.name:"Drop a file here, or choose one";
  $("#plConvert").disabled=!plFile||!S.sample;plStatus("");
}
async function convertPlan(){
  if(!plFile||!S.sample||ro())return;
  if(plFile.size>25*1024*1024){plStatus("That file is over 25 MB. Upload a smaller version.");return}
  const file=plFile,kind=$("#plKind").value,site=S.site;
  $("#plConvert").disabled=true;plStatus("Reading the file…");
  const done=()=>{$("#plStop").hidden=true;$("#plConvert").disabled=!plFile;plCtl=null};
  const lim=await S.sample.limits().catch(()=>null);
  const maxImgs=lim&&lim.images?Math.min(lim.images.maxCount,10):0;
  let ex;
  try{ex=await extractFile(file,maxImgs)}catch(e){plStatus((e&&e.message)||"Couldn't read that file.");done();return}
  if(ex.images&&!maxImgs){plStatus("Photos can't be converted in this view. Upload a PDF with selectable text, or a Word or Excel file.");done();return}
  let text=ex.text||"",cut=false;
  if(!ex.images&&text.replace(/\s/g,"").length<20){plStatus("No text found in that file.");done();return}
  if(text.length>150000){text=text.slice(0,150000);cut=true}
  plCtl=new AbortController();$("#plStop").hidden=false;
  plStatus("Claude is formatting the document. This can take a minute or two…");
  const opts={signal:plCtl.signal,modelTier:"default",onText:({text:t})=>plStatus(`Claude is writing the table… ${t.length.toLocaleString("en-GB")} characters`)};
  if(ex.images)opts.images=ex.images;
  let raw;
  try{raw=await S.sample.json(buildPrompt(kind,file.name,text,ex.images?ex.images.length:0),opts)}
  catch(e){plStatus(sampleErr(e));done();return}
  const doc=normalizePlan(raw,kind,file.name,cut||!!ex.pagesSkipped);
  if(!doc[rowsKey(doc.type)].length&&!doc.notes){plStatus("Claude couldn't find a HACCP table or risk assessment in that file. Choose the type yourself and try again, or start from a template.");done();return}
  try{
    const ref=await C("plans",site).add(doc);
    plStatus("");setPlFile(null);$("#plFile").value="";done();
    if(site===S.site){openPlan(ref.id,doc);toast("Converted. Check it over, then save any changes.")}else toast(`Converted and saved to ${siteOf(site).name}.`);
  }catch(e){fail(e);plStatus("Couldn't save the converted document.");done()}
}
async function newPlan(k){
  if(ro())return;
  const now=Date.now();
  const steps=["Purchasing & delivery","Chilled storage","Dry storage","Preparation","Cooking & reheating","Hot holding","Chilled display","Service","Cleaning"];
  const d={type:k,title:k==="haccp"?"HACCP plan":"Risk assessment",notes:"",source:"",createdBy:S.me,createdAt:now,updatedBy:S.me,updatedAt:now,history:[{by:S.me,at:now,what:"Created from template"}]};
  for(const[f]of PL_META[k])d[f]="";
  d.date=today();
  d[rowsKey(k)]=k==="haccp"?steps.map(s=>({...blankRow(k),step:s})):[blankRow(k),blankRow(k),blankRow(k)];
  try{const ref=await C("plans").add(d);openPlan(ref.id,d)}catch(e){fail(e)}
}
function renderPlansList(){
  const box=$("#plList");box.replaceChildren();const ids=[];
  const list=[...S.plans].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  const over=list.filter(d=>reviewState(d).overdue).length;
  const p=$("#plPill");p.textContent=list.length?(over?`${over} review${over===1?"":"s"} overdue`:`${list.length} document${list.length===1?"":"s"}`):"None yet";p.className="pill "+(over?"bad":list.length?"ok":"");
  if(!list.length)box.append(el("div",{class:"empty",text:"No HACCP plans or risk assessments yet. Upload one below, or start from a template."}));
  for(const d of list){
    const rows=d[rowsKey(d.type)]||[];ids.push(d.updatedBy);
    const summary=d.type==="haccp"
      ?`${rows.length} row${rows.length===1?"":"s"} · ${rows.filter(r=>r.ccp).length} CCP${rows.filter(r=>r.ccp).length===1?"":"s"}`
      :`${rows.length} hazard${rows.length===1?"":"s"} · ${rows.filter(r=>riskOf(r).cls==="bad").length} high risk · ${rows.filter(r=>r.furtherAction&&!r.done).length} action${rows.filter(r=>r.furtherAction&&!r.done).length===1?"":"s"} open`;
    const rs=reviewState(d);
    box.append(el("div",{class:"plan-card"},
      el("div",{},el("button",{class:"open",onclick:()=>openPlan(d.id)},d.title||PL_NAME[d.type]),
        el("div",{class:"by",text:[PL_NAME[d.type],summary].join(" · ")}),
        el("div",{class:"by",text:`Updated ${when(d.updatedAt)} by ${nameOf(d.updatedBy)}${d.source?" · from "+d.source:""}`})),
      el("span",{class:"pill "+rs.cls,text:rs.text})));
  }
  $("#plNewRow").hidden=ro();
  $("#plUploadPanel").hidden=ro()||!S.sample;
  $("#plConvert").disabled=!plFile||!S.sample;
  resolveNames(ids);
}
function openPlan(id,data){
  const p=data||S.plans.find(x=>x.id===id);if(!p)return;
  S.plan={id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false};
  $("#planListView").hidden=true;$("#planEditView").hidden=false;
  renderEditor();window.scrollTo({top:0});
}
function closePlan(){S.plan=null;$("#planEditView").hidden=true;$("#planEditView").replaceChildren();$("#planListView").hidden=false;renderPlansList()}
function grow(ta){ta.style.height="auto";ta.style.height=ta.scrollHeight+2+"px"}
function markDirty(){if(S.plan&&!S.plan.dirty){S.plan.dirty=true;updateSaveBar()}}
function updateSaveBar(){
  const P=S.plan;if(!P)return;
  const st=$("#plSaveState"),btn=$("#plSaveBtn"),back=$("#plBack");
  if(st){st.textContent=P.dirty?"Unsaved changes":`Saved ${when(P.doc.updatedAt)}`;st.className="pill "+(P.dirty?"warn":"ok")}
  if(btn)btn.disabled=!P.dirty||ro();
  if(back&&back.dataset.armed!=="1")back.textContent="← All documents";
  const rb=$("#plRemote");if(rb)rb.hidden=!P.remote;
}
function renderEditor(){
  const P=S.plan,d=P.doc,k=d.type,R=ro(),box=$("#planEditView");
  const rk=rowsKey(k);d[rk]=d[rk]||[];
  const back=el("button",{class:"btn ghost sm",id:"plBack"},"← All documents");
  back.addEventListener("click",()=>{
    if(!P.dirty)return closePlan();
    if(back.dataset.armed!=="1"){back.dataset.armed="1";back.textContent="Discard unsaved changes?";setTimeout(()=>{back.dataset.armed="";updateSaveBar()},3500);return}
    closePlan();
  });
  const remote=el("div",{class:"banner",id:"plRemote",hidden:!P.remote},
    el("span",{text:"Someone else saved this document while you were editing. Saving now will replace their changes. "}),
    el("button",{class:"linkbtn",onclick:()=>{const p=S.plans.find(x=>x.id===P.id);if(p){S.plan={id:P.id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false};renderEditor()}}},"Load their version"));
  // header
  const title=el("input",{type:"text",class:"title-in",id:"pl_title",value:d.title||"","aria-label":"Title",disabled:R});
  title.addEventListener("input",()=>{d.title=title.value;markDirty()});
  const meta=el("div",{class:"fields"});
  for(const[f,lbl,t]of PL_META[k]){
    const id="pl_"+f;const inp=el("input",{type:t==="date"?"date":"text",id,value:d[f]||"",disabled:R});
    inp.addEventListener("input",()=>{d[f]=inp.value;markDirty()});
    meta.append(el("div",{class:"field"+(f==="scope"||f==="area"?" wide":"")},el("label",{class:"label",for:id,text:lbl}),inp));
  }
  // table
  const cols=PL_COLS[k];
  const tbody=el("tbody");
  const buildRows=()=>{
    tbody.replaceChildren();
    d[rk].forEach((r,i)=>{
      const tr=el("tr",{class:r.ccp?"ccp":""});let rateSpan=null;
      for(const[f,lbl,t]of cols){
        const td=el("td",{class:t.startsWith("w-")?t:"w-x"});
        const aria=`${lbl}, row ${i+1}`;
        if(t.startsWith("w-")){
          const ta=el("textarea",{class:"cell",rows:1,value:r[f]||"","aria-label":aria,disabled:R});
          ta.addEventListener("input",()=>{r[f]=ta.value;grow(ta);markDirty()});
          td.append(ta);
        }else if(t==="sel"){
          const s=el("select",{"aria-label":aria,disabled:R});for(const h of HAZ_TYPES)s.append(el("option",{value:h},h||"–"));s.value=r[f]||"";
          s.addEventListener("change",()=>{r[f]=s.value;markDirty()});td.append(s);
        }else if(t==="chk"){
          td.className="ctr";const cb=el("input",{type:"checkbox","aria-label":aria,disabled:R});cb.checked=!!r[f];
          cb.addEventListener("change",()=>{r[f]=cb.checked;if(f==="ccp")tr.classList.toggle("ccp",cb.checked);markDirty()});td.append(cb);
        }else if(t==="num"){
          const s=el("select",{"aria-label":aria,disabled:R});for(let n=0;n<=5;n++)s.append(el("option",{value:String(n)},n?String(n):"–"));s.value=String(r[f]||0);
          s.addEventListener("change",()=>{r[f]=Number(s.value);const q=riskOf(r);rateSpan.textContent=q.text;rateSpan.className="rate "+q.cls;markDirty()});td.append(s);
        }else if(t==="rate"){
          td.className="ctr";const q=riskOf(r);rateSpan=el("span",{class:"rate "+q.cls,text:q.text});td.append(rateSpan);
        }else if(t==="date"){
          const inp=el("input",{type:"date",value:r[f]||"","aria-label":aria,disabled:R});
          inp.addEventListener("input",()=>{r[f]=inp.value;markDirty()});td.append(inp);
        }
        tr.append(td);
      }
      if(!R){
        const add=el("button",{type:"button","aria-label":`Add a row below row ${i+1}`,title:"Add a row below",onclick:()=>{d[rk].splice(i+1,0,k==="haccp"?{...blankRow(k),step:r.step}:blankRow(k));markDirty();buildRows()}},"+");
        const del=el("button",{type:"button","aria-label":`Delete row ${i+1}`,title:"Delete row"},"✕");
        del.addEventListener("click",()=>{
          if(!del.classList.contains("armed")){del.classList.add("armed");del.textContent="Delete?";setTimeout(()=>{del.classList.remove("armed");del.textContent="✕"},3000);return}
          d[rk].splice(i,1);markDirty();buildRows();
        });
        tr.append(el("td",{},el("div",{class:"rowact"},add,del)));
      }
      tbody.append(tr);
    });
    if(!d[rk].length)tbody.append(el("tr",{},el("td",{colspan:cols.length+1,class:"by",text:"No rows yet."})));
    requestAnimationFrame(()=>tbody.querySelectorAll("textarea.cell").forEach(grow));
  };
  buildRows();
  const table=el("table",{class:"doc-table"},el("thead",{},el("tr",{},...cols.map(([,l,t])=>el("th",{class:t.startsWith("w-")?t:"",text:l})),R?null:el("th",{}))),tbody);
  const notes=el("textarea",{id:"pl_notes",value:d.notes||"",disabled:R,style:"min-height:110px"});
  notes.addEventListener("input",()=>{d.notes=notes.value;markDirty()});
  const legend=k==="haccp"
    ?"Rows ticked as CCP are critical control points and are highlighted. Click any cell to edit it, then save."
    :"Risk = likelihood × severity, each from 1 (lowest) to 5 (highest). 1–4 is low, 5–12 medium, 15–25 high.";
  const del=el("button",{class:"btn ghost danger",hidden:R},"Delete document");
  armDelete(del,"Delete document",async()=>{if(await save(()=>D("plans",P.id).delete())){closePlan();toast("Document deleted")}});
  const hist=(d.history||[]).slice(0,10);
  box.replaceChildren(
    el("div",{class:"row spread"},back,el("div",{class:"row",style:"gap:8px"},el("span",{class:"pill",text:PL_NAME[k]}),(()=>{const rs=reviewState(d);return el("span",{class:"pill "+rs.cls,text:rs.text})})())),
    remote,
    el("section",{class:"panel"},title,d.source?el("div",{class:"by",text:"Converted from "+d.source}):null,meta),
    el("section",{class:"panel"},
      el("div",{class:"row spread"},el("h2",{text:k==="haccp"?"Hazards and controls":"Hazards and actions"}),R?null:el("button",{class:"btn ghost sm",onclick:()=>{d[rk].push(blankRow(k));markDirty();buildRows()}},"Add row")),
      el("p",{class:"note",text:legend}),
      el("div",{class:"scroll"},table)),
    el("section",{class:"panel"},el("label",{class:"label",for:"pl_notes",text:"Notes"}),notes),
    el("section",{class:"panel"},el("h3",{text:"History"}),
      hist.length?el("div",{},...hist.map(h=>el("div",{class:"by",text:`${when(h.at)} · ${h.what} · ${nameOf(h.by)}`}))):el("div",{class:"by",text:"No history yet."})),
    R?el("div",{class:"note",text:"You can view this document but not edit it."})
     :el("div",{class:"savebar"},el("span",{class:"pill",id:"plSaveState"}),el("div",{class:"row",style:"gap:8px"},del,el("button",{class:"btn",id:"plSaveBtn",onclick:savePlan},"Save changes"))));
  updateSaveBar();
  resolveNames([...hist.map(h=>h.by)]);
}
async function savePlan(){
  const P=S.plan;if(!P||!P.dirty||ro())return;
  const d=P.doc,now=Date.now();
  d.updatedBy=S.me;d.updatedAt=now;
  d.history=[{by:S.me,at:now,what:"Edited"},...(d.history||[])].slice(0,20);
  const body=clone(d);
  if(JSON.stringify(body).length>250000){toast("This document is too large to save. Split it into two documents.");return}
  P.baseAt=now;
  if(await save(()=>D("plans",P.id).set(body))){P.dirty=false;P.remote=false;updateSaveBar();toast("Saved")}
}
function onPlansSnapshot(){
  renderPlansList();
  const P=S.plan;if(!P)return;
  const p=S.plans.find(x=>x.id===P.id);
  if(!p){if(!P.dirty){closePlan();toast("That document was deleted.")}return}
  if(p.updatedAt!==P.baseAt){
    if(!P.dirty){S.plan={id:P.id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false};renderEditor()}
    else{P.remote=true;updateSaveBar()}
  }
}
$("#plFile").addEventListener("change",e=>setPlFile(e.target.files[0]));
const drop=$("#plDrop");
["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over")}));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over")}));
drop.addEventListener("drop",e=>{const f=e.dataTransfer&&e.dataTransfer.files[0];if(f)setPlFile(f)});
$("#plConvert").addEventListener("click",convertPlan);
$("#plStop").addEventListener("click",()=>plCtl&&plCtl.abort());
$("#plNewHaccp").addEventListener("click",()=>newPlan("haccp"));
$("#plNewRisk").addEventListener("click",()=>newPlan("risk"));
window.addEventListener("beforeunload",e=>{if(S.plan&&S.plan.dirty){e.preventDefault();e.returnValue=""}});

/* ---------- EHO inspections ---------- */
const EHO_AREAS=["Hygienic food handling","Cleanliness and structure","Management of food safety","Allergens","Other"];
const EHO_PRI=[["must","Must do","bad"],["should","Should do","warn"],["advice","Advice","ok"]];
const priOf=k=>EHO_PRI.find(p=>p[0]===k)||EHO_PRI[1];
const ratingCls=r=>r==null||r===""?"":r>=4?"ok":r===3?"warn":"bad";
const longDate=s=>s?parse(s).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):"";
const EHO_SHAPE=`{"inspectionDate":"YYYY-MM-DD or as written","inspector":"officer's name","authority":"council or local authority","visitType":"e.g. Routine inspection, Revisit, Complaint","rating":5,"scores":{"hygiene":"hygienic food handling score as written","structure":"cleanliness and condition of facilities and building score as written","management":"management of food safety / confidence in management score as written"},"revisitDate":"YYYY-MM-DD, as written, or empty","summary":"two or three sentences in plain English on the overall outcome","goodPoints":["things the inspector said were good"],"issues":[{"issue":"what the inspector found, in the report's words","area":"one of: ${EHO_AREAS.join(" | ")}","priority":"must | should | advice","action":"what needs doing to put it right, as the report says","deadline":"YYYY-MM-DD, as written, or empty","ref":"legal reference if given, else empty"}],"notes":"string"}`;
function ehoPrompt(fname,text,nImg){
  return `Read this food hygiene inspection report from a UK local authority Environmental Health Officer (EHO) for a café, and turn it into structured JSON so the café can track and tick off every issue raised.

Rules:
- Use only what the report says. Do not invent issues, ratings, scores or dates.
- "issues" must include every contravention, required action, recommendation and piece of advice in the report, one entry each, in the order they appear. Keep the report's wording, tidied into short clear sentences.
- priority: "must" for legal contraventions or anything the business is required to do; "should" for recommendations or good practice; "advice" for general advice or information.
- rating is the Food Hygiene Rating (0 to 5) as a number, or null if the report doesn't give one.
- Use "" for anything not given. Write dates as YYYY-MM-DD when a full date is given.
- Put anything else useful (e.g. date the rating will be published, appeal or right-to-reply deadlines, request-a-revisit details) in "notes".

Reply with only a JSON object in this shape:
${EHO_SHAPE}

File name: ${fname}
${nImg?`The report is in the ${nImg} attached image${nImg>1?"s":""}, in page order.`:`Report text:\n"""\n${text}\n"""`}`;
}
const newIssueId=()=>"i"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function normalizeInsp(raw,fname,cut){
  raw=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const str=v=>v==null?"":String(v).trim();const left=[];
  const r=raw.rating===null||raw.rating===""||raw.rating===undefined?null:Math.round(Number(raw.rating));
  const sc=raw.scores&&typeof raw.scores==="object"?raw.scores:{};
  const d={inspectionDate:isoDate(raw.inspectionDate,left),inspector:str(raw.inspector),authority:str(raw.authority),visitType:str(raw.visitType),
    rating:isFinite(r)&&r>=0&&r<=5?r:null,scores:{hygiene:str(sc.hygiene),structure:str(sc.structure),management:str(sc.management)},
    revisitDate:isoDate(raw.revisitDate,left),summary:str(raw.summary),
    goodPoints:(Array.isArray(raw.goodPoints)?raw.goodPoints:[]).map(str).filter(Boolean)};
  d.issues=(Array.isArray(raw.issues)?raw.issues:[]).filter(i=>i&&typeof i==="object"&&(i.issue||i.action)).map(i=>{
    const p=str(i.priority).toLowerCase();
    return{id:newIssueId(),issue:str(i.issue),area:EHO_AREAS.find(a=>a.toLowerCase()===str(i.area).toLowerCase())||"Other",
      priority:p.startsWith("must")?"must":p.startsWith("adv")?"advice":"should",action:str(i.action),deadline:isoDate(i.deadline,left),ref:str(i.ref),done:false,doneBy:null,doneAt:null,fixNote:""};
  });
  const extra=[str(raw.notes)];
  if(left.length)extra.push("Dates as written in the report: "+left.join("; "));
  if(cut)extra.push("Only the first part of the report was read because it was very long. Check the rest by hand.");
  d.notes=extra.filter(Boolean).join("\n\n");
  const now=Date.now();
  Object.assign(d,{source:fname,createdBy:S.me,createdAt:now,updatedBy:S.me,updatedAt:now,history:[{by:S.me,at:now,what:"Read from "+fname}]});
  return d;
}
const inspSorted=()=>[...S.inspections].sort((a,b)=>(b.inspectionDate||"").localeCompare(a.inspectionDate||"")||(b.createdAt||0)-(a.createdAt||0));
function deadlineState(i){
  if(i.done||!i.deadline)return null;
  const left=Math.round((parse(i.deadline)-parse(today()))/864e5);
  if(left<0)return{cls:"bad",text:"Overdue since "+short(i.deadline)};
  if(left<=7)return{cls:"warn",text:"Due "+short(i.deadline)};
  return{cls:"",text:"Due "+short(i.deadline)};
}
let ehoFile=null,ehoCtl=null;
function ehoStatus(t){$("#ehoStatus").textContent=t}
function setEhoFile(f){ehoFile=f||null;$("#ehoDropText").textContent=ehoFile?ehoFile.name:"Drop a file here, or choose one";$("#ehoConvert").disabled=!ehoFile||!S.sample;ehoStatus("")}
async function convertEho(){
  if(!ehoFile||!S.sample||ro())return;
  if(ehoFile.size>25*1024*1024){ehoStatus("That file is over 25 MB. Upload a smaller version.");return}
  const file=ehoFile,site=S.site;
  $("#ehoConvert").disabled=true;ehoStatus("Reading the file…");
  const done=()=>{$("#ehoStop").hidden=true;$("#ehoConvert").disabled=!ehoFile;ehoCtl=null};
  const lim=await S.sample.limits().catch(()=>null);
  const maxImgs=lim&&lim.images?Math.min(lim.images.maxCount,10):0;
  let ex;
  try{ex=await extractFile(file,maxImgs)}catch(e){ehoStatus((e&&e.message)||"Couldn't read that file.");done();return}
  if(ex.images&&!maxImgs){ehoStatus("Photos can't be read in this view. Upload a PDF with selectable text, or a Word file.");done();return}
  let text=ex.text||"",cut=false;
  if(!ex.images&&text.replace(/\s/g,"").length<20){ehoStatus("No text found in that file.");done();return}
  if(text.length>120000){text=text.slice(0,120000);cut=true}
  ehoCtl=new AbortController();$("#ehoStop").hidden=false;
  ehoStatus("Claude is reading the report. This can take a minute or two…");
  const opts={signal:ehoCtl.signal,modelTier:"default",onText:({text:t})=>ehoStatus(`Claude is listing the issues… ${t.length.toLocaleString("en-GB")} characters`)};
  if(ex.images)opts.images=ex.images;
  let raw;
  try{raw=await S.sample.json(ehoPrompt(file.name,text,ex.images?ex.images.length:0),opts)}
  catch(e){ehoStatus(sampleErr(e));done();return}
  const doc=normalizeInsp(raw,file.name,cut||!!ex.pagesSkipped);
  if(!doc.inspectionDate&&!doc.issues.length&&doc.rating==null){ehoStatus("That doesn't look like an inspection report. Try another file, or enter it by hand.");done();return}
  try{
    await C("inspections",site).add(doc);
    ehoStatus("");setEhoFile(null);$("#ehoFile").value="";done();
    toast(doc.issues.length?`Found ${doc.issues.length} issue${doc.issues.length===1?"":"s"} to address`:"Report read. No issues found.");
    if(!doc.inspectionDate)toast("Couldn't find the inspection date. Tap Edit to add it.");
  }catch(e){fail(e);ehoStatus("Couldn't save the inspection.");done()}
}
async function tickIssue(inspId,issueId,patch){
  if(ro())return;
  const cur=S.inspections.find(x=>x.id===inspId);if(!cur)return;
  const issues=(cur.issues||[]).map(i=>i.id===issueId?{...i,...patch}:i);
  await save(()=>D("inspections",inspId).update({issues,updatedBy:S.me,updatedAt:Date.now()}));
}
function inspHero(d,big){
  const n=(d.issues||[]).length,fixed=(d.issues||[]).filter(i=>i.done).length;
  const ago=d.inspectionDate?Math.round((parse(today())-parse(d.inspectionDate))/864e5):null;
  const rc=ratingCls(d.rating);
  const sec=el("section",{class:"panel"});
  sec.append(el("div",{class:"hero"},
    el("div",{style:"display:grid;gap:6px;min-width:0"},
      el("div",{class:"label",text:big?`${curSite().name}: last EHO inspection`:"Inspection date"}),
      el("div",{class:"bigdate",text:d.inspectionDate?longDate(d.inspectionDate):"Date not recorded"}),
      el("div",{class:"metaline",style:"display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--muted)"},
        ...[ago!=null?(ago===0?"Today":ago>0?`${ago} day${ago===1?"":"s"} ago`:`in ${-ago} days`):"",d.visitType,d.inspector?"Inspector: "+d.inspector:"",d.authority].filter(Boolean).map(t=>el("span",{text:t})))),
    el("div",{class:"ratingbadge "+rc,title:"Food hygiene rating"},el("b",{text:d.rating==null?"–":String(d.rating)}),el("span",{text:"Hygiene rating"}))));
  const sc=d.scores||{};
  if(sc.hygiene||sc.structure||sc.management)sec.append(el("div",{class:"scores"},
    ...[["Food handling",sc.hygiene],["Cleanliness & structure",sc.structure],["Management",sc.management]].filter(x=>x[1]).map(([l,v])=>el("div",{},el("span",{class:"by",text:l}),el("b",{text:v})))));
  if(d.revisitDate)sec.append(el("div",{class:"chips"},el("span",{class:"pill "+(d.revisitDate>=today()?"warn":""),text:"Revisit: "+longDate(d.revisitDate)})));
  if(d.summary)sec.append(el("p",{class:"note",style:"font-size:14px;color:var(--fg)",text:d.summary}));
  if(n){
    sec.append(el("div",{style:"display:grid;gap:6px"},
      el("div",{class:"row spread"},el("strong",{text:`${fixed} of ${n} issue${n===1?"":"s"} addressed`}),el("span",{class:"pill "+(fixed===n?"ok":(d.issues.some(i=>!i.done&&i.priority==="must")?"bad":"warn")),text:fixed===n?"All done":`${n-fixed} still to do`})),
      el("div",{class:"progress",role:"progressbar","aria-valuemin":"0","aria-valuemax":String(n),"aria-valuenow":String(fixed)},el("i",{style:`width:${Math.round(100*fixed/n)}%`}))));
  }
  return sec;
}
function issueList(d){
  const box=el("div",{});const R=ro();const ids=[];
  const order={must:0,should:1,advice:2};
  const list=[...(d.issues||[])].sort((a,b)=>(a.done-b.done)||(order[a.priority]-order[b.priority])||(a.deadline||"9").localeCompare(b.deadline||"9"));
  if(!list.length)box.append(el("div",{class:"empty",text:"No issues recorded for this inspection."}));
  for(const i of list){
    const id="iss_"+d.id+"_"+i.id;if(i.doneBy)ids.push(i.doneBy);
    const cb=el("input",{type:"checkbox",id,disabled:R,"aria-label":"Addressed: "+i.issue});cb.checked=!!i.done;
    cb.addEventListener("change",async()=>{
      await tickIssue(d.id,i.id,cb.checked?{done:true,doneBy:S.me,doneAt:Date.now()}:{done:false,doneBy:null,doneAt:null});
      if(cb.checked)toast("Marked as addressed");
    });
    const p=priOf(i.priority);const dl=deadlineState(i);
    const body=el("div",{class:"body"},
      el("label",{for:id,class:"itext",text:i.issue||i.action}),
      i.action&&i.issue?el("div",{text:"Action: "+i.action}):null,
      el("div",{class:"chips"},el("span",{class:"pill "+p[2],text:p[1]}),el("span",{class:"pill",text:i.area}),dl?el("span",{class:"pill "+dl.cls,text:dl.text}):null,i.ref?el("span",{class:"by",text:i.ref}):null),
      i.done?el("div",{class:"by",text:`Addressed by ${nameOf(i.doneBy)} on ${when(i.doneAt)}`}):null);
    if(i.done&&!R){
      const fx=el("input",{type:"text",id:"fx_"+d.id+"_"+i.id,value:i.fixNote||"",placeholder:"What did you do? (optional)","aria-label":"What was done"});
      fx.addEventListener("change",()=>tickIssue(d.id,i.id,{fixNote:fx.value.trim()}));
      body.append(el("div",{class:"fix"},fx));
    }else if(i.done&&i.fixNote)body.append(el("div",{class:"by",text:"What we did: "+i.fixNote}));
    box.append(el("div",{class:"issue"+(i.done?" done":"")},cb,body));
  }
  resolveNames(ids);
  return box;
}
function renderInspList(){
  const R=ro();const list=inspSorted();const latest=list[0];
  // header pill
  const hd=$("#ehoHead");hd.replaceChildren();
  if(latest&&latest.inspectionDate){
    const open=(latest.issues||[]).filter(i=>!i.done).length;
    hd.append(el("button",{class:"ehohead",onclick:()=>show("eho")},el("span",{text:`${curSite().name}: last EHO inspection`}),el("strong",{text:longDate(latest.inspectionDate)}),
      latest.rating!=null?el("span",{class:"pill "+ratingCls(latest.rating),text:"Rated "+latest.rating}):null,
      open?el("span",{class:"pill bad",text:`${open} issue${open===1?"":"s"} open`}):null));
  }
  if(S.insp)return;
  const box=$("#ehoLatest");box.replaceChildren();
  if(!latest){
    box.append(el("section",{class:"panel"},el("h2",{text:`${curSite().name} EHO inspection`}),el("div",{class:"empty",text:`No inspection recorded for the ${curSite().name} yet. Upload its last inspection report below, or enter it by hand.`})));
  }else{
    box.append(inspHero(latest,true));
    box.append(el("section",{class:"panel"},
      el("div",{class:"row spread"},el("h2",{text:"Issues to address"}),R?null:el("button",{class:"btn ghost sm",onclick:()=>openInsp(latest.id)},"Edit inspection")),
      el("p",{class:"note",text:"Tick each issue once it's been put right. Must-do items are legal requirements; the inspector may check them at a revisit or your next inspection."}),
      issueList(latest)));
    if(latest.goodPoints&&latest.goodPoints.length)box.append(el("section",{class:"panel"},el("h3",{text:"What the inspector said was good"}),el("ul",{style:"margin:0;padding-left:20px;display:grid;gap:4px"},...latest.goodPoints.map(g=>el("li",{text:g})))));
    if(latest.notes)box.append(el("section",{class:"panel"},el("h3",{text:"Notes"}),el("div",{class:"docview"},renderBody(latest.notes))));
  }
  const past=list.slice(1);const pb=$("#ehoPast");pb.replaceChildren();
  $("#ehoPastPanel").hidden=!past.length;
  for(const d of past){
    const n=(d.issues||[]).length,f=(d.issues||[]).filter(i=>i.done).length;
    pb.append(el("div",{class:"plan-card"},
      el("div",{},el("button",{class:"open",onclick:()=>openInsp(d.id)},d.inspectionDate?longDate(d.inspectionDate):"Date not recorded"),
        el("div",{class:"by",text:[d.visitType,d.authority,n?`${f} of ${n} issues addressed`:"No issues"].filter(Boolean).join(" · ")})),
      el("span",{class:"pill "+ratingCls(d.rating),text:d.rating==null?"No rating":"Rated "+d.rating})));
  }
  $("#ehoUploadPanel").hidden=R;
  $("#ehoConvert").disabled=!ehoFile||!S.sample;
  $("#ehoConvert").hidden=!S.sample;$("#ehoDrop").hidden=!S.sample;
}
function openInsp(id,data){
  const p=data||S.inspections.find(x=>x.id===id);if(!p)return;
  S.insp={id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false};
  $("#ehoListView").hidden=true;$("#ehoEditView").hidden=false;renderInspEditor();window.scrollTo({top:0});
}
function closeInsp(){S.insp=null;$("#ehoEditView").hidden=true;$("#ehoEditView").replaceChildren();$("#ehoListView").hidden=false;renderInspList()}
function ehoDirty(){if(S.insp&&!S.insp.dirty){S.insp.dirty=true;ehoSaveBar()}}
function ehoSaveBar(){
  const P=S.insp;if(!P)return;
  const st=$("#ehoSaveState"),btn=$("#ehoSaveBtn"),back=$("#ehoBack");
  if(st){st.textContent=P.dirty?"Unsaved changes":`Saved ${when(P.doc.updatedAt)}`;st.className="pill "+(P.dirty?"warn":"ok")}
  if(btn)btn.disabled=!P.dirty||ro();
  if(back&&back.dataset.armed!=="1")back.textContent="← Back";
  const rb=$("#ehoRemote");if(rb)rb.hidden=!P.remote;
}
function renderInspEditor(){
  const P=S.insp,d=P.doc,box=$("#ehoEditView");
  d.issues=d.issues||[];d.scores=d.scores||{};d.goodPoints=d.goodPoints||[];
  const back=el("button",{class:"btn ghost sm",id:"ehoBack"},"← Back");
  back.addEventListener("click",()=>{
    if(!P.dirty)return closeInsp();
    if(back.dataset.armed!=="1"){back.dataset.armed="1";back.textContent="Discard unsaved changes?";setTimeout(()=>{back.dataset.armed="";ehoSaveBar()},3500);return}
    closeInsp();
  });
  const remote=el("div",{class:"banner",id:"ehoRemote",hidden:!P.remote},
    el("span",{text:"Someone else changed this inspection while you were editing (for example, ticked an issue). Saving now will replace their changes. "}),
    el("button",{class:"linkbtn",onclick:()=>{const p=S.inspections.find(x=>x.id===P.id);if(p){S.insp={id:P.id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false};renderInspEditor()}}},"Load their version"));
  const fld=(id,lbl,inp,wide)=>el("div",{class:"field"+(wide?" wide":"")},el("label",{class:"label",for:id,text:lbl}),inp);
  const txt=(key,obj,type)=>{const i=el("input",{type:type||"text",id:"eh_"+key,value:(obj||d)[key]||""});i.addEventListener("input",()=>{(obj||d)[key]=i.value;ehoDirty()});return i};
  const rating=el("select",{id:"eh_rating"});rating.append(el("option",{value:""},"Not given"));for(let n=5;n>=0;n--)rating.append(el("option",{value:String(n)},String(n)));
  rating.value=d.rating==null?"":String(d.rating);rating.addEventListener("change",()=>{d.rating=rating.value===""?null:Number(rating.value);ehoDirty()});
  const dateIn=txt("inspectionDate",null,"date");dateIn.style.fontWeight="700";
  const summary=el("textarea",{id:"eh_summary",value:d.summary||"",style:"min-height:70px"});summary.addEventListener("input",()=>{d.summary=summary.value;ehoDirty()});
  const good=el("textarea",{id:"eh_good",value:d.goodPoints.join("\n"),style:"min-height:70px"});good.addEventListener("input",()=>{d.goodPoints=good.value.split("\n").map(s=>s.trim()).filter(Boolean);ehoDirty()});
  const notes=el("textarea",{id:"eh_notes",value:d.notes||"",style:"min-height:70px"});notes.addEventListener("input",()=>{d.notes=notes.value;ehoDirty()});
  const iss=el("div",{style:"display:grid;gap:12px"});
  d.issues.forEach((i,k)=>{
    const ta=(key,lbl)=>{const t=el("textarea",{id:`eh_${key}_${k}`,value:i[key]||""});t.addEventListener("input",()=>{i[key]=t.value;grow(t);ehoDirty()});return fld(`eh_${key}_${k}`,lbl,t,true)};
    const area=el("select",{id:"eh_area_"+k});for(const a of EHO_AREAS)area.append(el("option",{value:a},a));area.value=i.area||"Other";area.addEventListener("change",()=>{i.area=area.value;ehoDirty()});
    const pri=el("select",{id:"eh_pri_"+k});for(const[v,l]of EHO_PRI)pri.append(el("option",{value:v},l));pri.value=i.priority||"should";pri.addEventListener("change",()=>{i.priority=pri.value;ehoDirty()});
    const dl=el("input",{type:"date",id:"eh_dl_"+k,value:i.deadline||""});dl.addEventListener("input",()=>{i.deadline=dl.value;ehoDirty()});
    const ref=el("input",{type:"text",id:"eh_ref_"+k,value:i.ref||""});ref.addEventListener("input",()=>{i.ref=ref.value;ehoDirty()});
    const dn=el("input",{type:"checkbox",id:"eh_done_"+k});dn.checked=!!i.done;
    dn.addEventListener("change",()=>{i.done=dn.checked;i.doneBy=dn.checked?S.me:null;i.doneAt=dn.checked?Date.now():null;ehoDirty()});
    const del=el("button",{class:"btn ghost sm danger"},"Delete issue");
    armDelete(del,"Delete issue",()=>{d.issues.splice(k,1);ehoDirty();renderInspEditor()});
    iss.append(el("div",{class:"iss-edit"},el("div",{class:"row spread"},el("strong",{text:`Issue ${k+1}`}),el("label",{class:"row",style:"gap:6px",for:"eh_done_"+k},dn,"Addressed")),
      el("div",{class:"fields"},ta("issue","What the inspector found"),ta("action","Action needed"),fld("eh_area_"+k,"Area",area),fld("eh_pri_"+k,"Priority",pri),fld("eh_dl_"+k,"Deadline",dl),fld("eh_ref_"+k,"Legal reference",ref)),
      el("div",{class:"row"},del)));
  });
  requestAnimationFrame(()=>iss.querySelectorAll("textarea").forEach(grow));
  const delDoc=el("button",{class:"btn ghost danger"},"Delete inspection");
  armDelete(delDoc,"Delete inspection",async()=>{if(await save(()=>D("inspections",P.id).delete())){closeInsp();toast("Inspection deleted")}});
  box.replaceChildren(
    el("div",{class:"row spread"},back,el("span",{class:"pill",text:"Editing inspection"})),
    remote,
    el("section",{class:"panel"},el("h2",{text:"Inspection details"}),d.source?el("div",{class:"by",text:"Read from "+d.source}):null,
      el("div",{class:"fields"},fld("eh_inspectionDate","Inspection date",dateIn),fld("eh_rating","Food hygiene rating",rating),fld("eh_visitType","Type of visit",txt("visitType")),
        fld("eh_inspector","Inspector",txt("inspector")),fld("eh_authority","Local authority",txt("authority")),fld("eh_revisitDate","Revisit date",txt("revisitDate",null,"date")),
        fld("eh_hygiene","Score: food handling",txt("hygiene",d.scores)),fld("eh_structure","Score: cleanliness & structure",txt("structure",d.scores)),fld("eh_management","Score: management",txt("management",d.scores)),
        fld("eh_summary","Summary",summary,true),fld("eh_good","Good points (one per line)",good,true))),
    el("section",{class:"panel"},el("div",{class:"row spread"},el("h2",{text:"Issues"}),el("button",{class:"btn ghost sm",onclick:()=>{d.issues.push({id:newIssueId(),issue:"",area:"Other",priority:"should",action:"",deadline:"",ref:"",done:false,doneBy:null,doneAt:null,fixNote:""});ehoDirty();renderInspEditor()}},"Add issue")),
      d.issues.length?iss:el("div",{class:"empty",text:"No issues. Add one if the inspector raised anything."})),
    el("section",{class:"panel"},fld("eh_notes","Notes",notes,true)),
    el("div",{class:"savebar"},el("span",{class:"pill",id:"ehoSaveState"}),el("div",{class:"row",style:"gap:8px"},delDoc,el("button",{class:"btn",id:"ehoSaveBtn",onclick:saveInsp},"Save changes"))));
  ehoSaveBar();
}
async function saveInsp(){
  const P=S.insp;if(!P||!P.dirty||ro())return;
  const d=P.doc,now=Date.now();
  d.issues=d.issues.filter(i=>(i.issue||"").trim()||(i.action||"").trim());
  d.updatedBy=S.me;d.updatedAt=now;
  d.history=[{by:S.me,at:now,what:"Edited"},...(d.history||[])].slice(0,20);
  P.baseAt=now;
  if(await save(()=>D("inspections",P.id).set(clone(d)))){P.dirty=false;P.remote=false;toast("Saved");closeInsp()}
}
function onInspSnapshot(){
  renderInspList();
  const P=S.insp;if(!P)return;
  const p=S.inspections.find(x=>x.id===P.id);
  if(!p){if(!P.dirty){closeInsp();toast("That inspection was deleted.")}return}
  if(p.updatedAt!==P.baseAt){
    if(!P.dirty){S.insp={id:P.id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false};renderInspEditor()}
    else{P.remote=true;ehoSaveBar()}
  }
}
async function manualInsp(){
  if(ro())return;const now=Date.now();
  const d={inspectionDate:"",inspector:"",authority:"",visitType:"Routine inspection",rating:null,scores:{hygiene:"",structure:"",management:""},revisitDate:"",summary:"",goodPoints:[],
    issues:[],notes:"",source:"",createdBy:S.me,createdAt:now,updatedBy:S.me,updatedAt:now,history:[{by:S.me,at:now,what:"Entered by hand"}]};
  try{const ref=await C("inspections").add(d);openInsp(ref.id,{...d,id:ref.id})}catch(e){fail(e)}
}
$("#ehoFile").addEventListener("change",e=>setEhoFile(e.target.files[0]));
const ehoDrop=$("#ehoDrop");
["dragenter","dragover"].forEach(ev=>ehoDrop.addEventListener(ev,e=>{e.preventDefault();ehoDrop.classList.add("over")}));
["dragleave","drop"].forEach(ev=>ehoDrop.addEventListener(ev,e=>{e.preventDefault();ehoDrop.classList.remove("over")}));
ehoDrop.addEventListener("drop",e=>{const f=e.dataTransfer&&e.dataTransfer.files[0];if(f)setEhoFile(f)});
$("#ehoConvert").addEventListener("click",convertEho);
$("#ehoStop").addEventListener("click",()=>ehoCtl&&ehoCtl.abort());
$("#ehoManual").addEventListener("click",manualInsp);
window.addEventListener("beforeunload",e=>{if(S.insp&&S.insp.dirty){e.preventDefault();e.returnValue=""}});

/* ---------- onboarding documents ---------- */
const ONB_CATS=["Induction checklist","Staff handbook","Policy","Procedure","Job description","Training guide","Form or template","Other"];
const ONB_META=[["category","Type","cat"],["audience","Who it's for","text"],["owner","Owner","text"],["date","Dated","date"],["reviewDate","Next review","date"]];
const ONB_SHAPE=`{"category":"one of: ${ONB_CATS.join(" | ")}","title":"string","audience":"who it is for, e.g. All staff, Baristas, Kitchen team","owner":"person responsible, if stated","date":"YYYY-MM-DD or as written","reviewDate":"YYYY-MM-DD or as written","summary":"one or two sentences on what the document covers","sections":[{"heading":"string","body":"plain text"}],"notes":"string"}`;
function onbPrompt(cat,fname,text,nImg){
  return `Convert this staff onboarding document from a UK café into structured JSON so it can be shown as a clean, editable document.${cat!=="auto"?` It is a ${cat.toLowerCase()}.`:""}

Rules:
- Keep all of the document's content, in its original order. Do not summarise, shorten or leave anything out, and do not add anything that isn't there.
- Keep the document's own wording. Fix only obvious typos, broken line wraps and capitalisation.
- Split it into sections at its headings. If it has no headings, give each part a short, plain heading.
- In "body" write plain text only: separate paragraphs with a blank line; start bullet points with "- ", numbered steps with "1. ", "2. " and so on, and tick boxes or checklist items with "[ ] " (or "[x] " if ticked in the original). No other formatting or markdown.
- Write each table row as a bullet point, for example "- Monday: 7am to 3pm".
- "summary" is the only place for your own words: one or two sentences on what the document covers.
- Use "" for anything the document doesn't give. Write dates as YYYY-MM-DD when a full date is given.
- Put signature and sign-off lines, and anything that doesn't fit a section, in "notes".

Reply with only a JSON object in this shape:
${ONB_SHAPE}

File name: ${fname}
${nImg?`The document is in the ${nImg} attached image${nImg>1?"s":""}, in page order.`:`Document text:\n"""\n${text}\n"""`}`;
}
function normalizeOnb(raw,cat,fname,cut){
  raw=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const str=v=>v==null?"":String(v).trim();const left=[];
  const c=cat!=="auto"?cat:(ONB_CATS.find(x=>x.toLowerCase()===str(raw.category).toLowerCase())||"Other");
  const d={category:c,title:str(raw.title)||c,audience:str(raw.audience),owner:str(raw.owner),date:isoDate(raw.date,left),reviewDate:isoDate(raw.reviewDate,left),summary:str(raw.summary)};
  d.sections=(Array.isArray(raw.sections)?raw.sections:[]).filter(s=>s&&typeof s==="object").map(s=>({heading:str(s.heading),body:str(s.body)})).filter(s=>s.heading||s.body);
  const extra=[str(raw.notes)];
  if(left.length)extra.push("Dates as written in the original: "+left.join("; "));
  if(cut)extra.push("Only the first part of the original was converted because it was very long. Check the rest by hand.");
  d.notes=extra.filter(Boolean).join("\n\n");
  const now=Date.now();
  Object.assign(d,{source:fname,createdBy:S.me,createdAt:now,updatedBy:S.me,updatedAt:now,history:[{by:S.me,at:now,what:"Converted from "+fname}]});
  return d;
}
function renderBody(text){
  const frag=document.createDocumentFragment();
  const lines=String(text||"").split("\n");let list=null,kind=null,para=[];
  const flushP=()=>{if(para.length){frag.append(el("p",{text:para.join(" ")}));para=[]}};
  const flushL=()=>{if(list){frag.append(list);list=null;kind=null}};
  for(const raw of lines){
    const l=raw.trim();let m;
    if(!l){flushP();flushL();continue}
    if((m=l.match(/^\[( |x|X)\]\s*(.*)$/))){
      flushP();if(kind!=="check"){flushL();list=el("ul",{class:"check"});kind="check"}
      list.append(el("li",{},el("span",{class:"box","aria-hidden":"true",text:m[1].trim()?"✓":""}),el("span",{text:m[2]})));continue;
    }
    if((m=l.match(/^[-•*]\s+(.*)$/))){flushP();if(kind!=="ul"){flushL();list=el("ul");kind="ul"}list.append(el("li",{text:m[1]}));continue}
    if((m=l.match(/^\d+[.)]\s+(.*)$/))){flushP();if(kind!=="ol"){flushL();list=el("ol");kind="ol"}list.append(el("li",{text:m[1]}));continue}
    flushL();para.push(l);
  }
  flushP();flushL();
  return frag;
}
let obFile=null,obCtl=null;
function obStatus(t){$("#obStatus").textContent=t}
function setObFile(f){obFile=f||null;$("#obDropText").textContent=obFile?obFile.name:"Drop a file here, or choose one";$("#obConvert").disabled=!obFile||!S.sample;obStatus("")}
async function convertOnb(){
  if(!obFile||!S.sample||ro())return;
  if(obFile.size>25*1024*1024){obStatus("That file is over 25 MB. Upload a smaller version.");return}
  const file=obFile,cat=$("#obKind").value,site=S.site;
  $("#obConvert").disabled=true;obStatus("Reading the file…");
  const done=()=>{$("#obStop").hidden=true;$("#obConvert").disabled=!obFile;obCtl=null};
  const lim=await S.sample.limits().catch(()=>null);
  const maxImgs=lim&&lim.images?Math.min(lim.images.maxCount,10):0;
  let ex;
  try{ex=await extractFile(file,maxImgs)}catch(e){obStatus((e&&e.message)||"Couldn't read that file.");done();return}
  if(ex.images&&!maxImgs){obStatus("Photos can't be converted in this view. Upload a PDF with selectable text, or a Word file.");done();return}
  let text=ex.text||"",cut=false;
  if(!ex.images&&text.replace(/\s/g,"").length<20){obStatus("No text found in that file.");done();return}
  if(text.length>90000){text=text.slice(0,90000);cut=true}
  obCtl=new AbortController();$("#obStop").hidden=false;
  obStatus("Claude is laying out the document. This can take a minute or two…");
  const opts={signal:obCtl.signal,modelTier:"default",onText:({text:t})=>obStatus(`Claude is writing the document… ${t.length.toLocaleString("en-GB")} characters`)};
  if(ex.images)opts.images=ex.images;
  let raw;
  try{raw=await S.sample.json(onbPrompt(cat,file.name,text,ex.images?ex.images.length:0),opts)}
  catch(e){obStatus(e&&e.code==="invalid_json"?"That document was too long for Claude to lay out in one go, or it couldn't be read. Try uploading it in smaller parts.":sampleErr(e));done();return}
  const doc=normalizeOnb(raw,cat,file.name,cut||!!ex.pagesSkipped);
  if(!doc.sections.length&&!doc.notes){obStatus("Claude couldn't find any content in that file.");done();return}
  try{
    const ref=await C("onboarding",site).add(doc);
    obStatus("");setObFile(null);$("#obFile").value="";done();
    if(site===S.site)openOnb(ref.id,doc,"view");toast("Converted. Check it over, then edit anything that needs fixing.");
  }catch(e){fail(e);obStatus("Couldn't save the converted document.");done()}
}
async function newOnb(template){
  if(ro())return;
  const now=Date.now();
  const d={category:template?"Induction checklist":"Other",title:template?"New starter induction":"Untitled document",audience:template?"All new staff":"",owner:"",date:today(),reviewDate:"",
    summary:template?"What every new member of staff needs to be shown, told and signed off on before and during their first weeks.":"",
    sections:template?[
      {heading:"Before the first shift",body:"[ ] Contract and right-to-work check completed\n[ ] Bank and payroll details collected (kept off this diary)\n[ ] Emergency contact recorded\n[ ] Uniform or apron given\n[ ] Rota and start time confirmed"},
      {heading:"First day",body:"[ ] Tour of the café, kitchen, stores and toilets\n[ ] Fire exits, fire alarm and assembly point\n[ ] First aid kit and accident book\n[ ] Handwashing and personal hygiene\n[ ] Reporting illness: stay off work until 48 hours after sickness or diarrhoea have stopped\n[ ] Where to find this diary, and how to fill in opening and closing checks"},
      {heading:"Food safety (Safer Food, Better Business)",body:"[ ] Cross-contamination\n[ ] Cleaning and the cleaning schedule\n[ ] Chilling and fridge temperatures\n[ ] Cooking and reheating\n[ ] Allergens: the 14 allergens and how to answer customer questions\n[ ] Recorded on the Staff training tab"},
      {heading:"First week",body:"[ ] Coffee machine and grinder: use and cleaning\n[ ] Till and card machine\n[ ] Opening routine\n[ ] Closing routine\n[ ] Deliveries: checking dates and temperatures"},
      {heading:"Sign-off",body:"Signed by the new starter and their manager once everything above is complete."}]
      :[{heading:"",body:""}],
    notes:"",source:"",createdBy:S.me,createdAt:now,updatedBy:S.me,updatedAt:now,history:[{by:S.me,at:now,what:template?"Created from induction template":"Created"}]};
  try{const ref=await C("onboarding").add(d);openOnb(ref.id,d,"edit")}catch(e){fail(e)}
}
function renderOnbList(){
  const box=$("#obList");box.replaceChildren();const ids=[];
  const list=[...S.onboarding].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  const over=list.filter(d=>reviewState(d).overdue).length;
  const p=$("#obPill");p.textContent=list.length?(over?`${over} review${over===1?"":"s"} overdue`:`${list.length} document${list.length===1?"":"s"}`):"None yet";p.className="pill "+(over?"bad":list.length?"ok":"");
  if(!list.length)box.append(el("div",{class:"empty",text:"No onboarding documents yet. Upload your staff handbook or induction checklist below, or start from the template."}));
  for(const d of list){
    ids.push(d.updatedBy);const rs=reviewState(d);
    box.append(el("div",{class:"plan-card"},
      el("div",{},el("button",{class:"open",onclick:()=>openOnb(d.id,null,"view")},d.title||"Untitled document"),
        el("div",{class:"by",text:[d.category,d.audience?"for "+d.audience:"",`${(d.sections||[]).length} section${(d.sections||[]).length===1?"":"s"}`].filter(Boolean).join(" · ")}),
        el("div",{class:"by",text:`Updated ${when(d.updatedAt)} by ${nameOf(d.updatedBy)}${d.source?" · from "+d.source:""}`})),
      d.reviewDate?el("span",{class:"pill "+rs.cls,text:rs.text}):el("span",{class:"pill",text:d.category})));
  }
  $("#obNewRow").hidden=ro();
  $("#obUploadPanel").hidden=ro()||!S.sample;
  $("#obConvert").disabled=!obFile||!S.sample;
  resolveNames(ids);
}
function openOnb(id,data,mode){
  const p=data||S.onboarding.find(x=>x.id===id);if(!p)return;
  S.onb={id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false,mode:ro()?"view":(mode||"view")};
  $("#obListView").hidden=true;$("#obEditView").hidden=false;renderOnbEditor();window.scrollTo({top:0});
}
function closeOnb(){S.onb=null;$("#obEditView").hidden=true;$("#obEditView").replaceChildren();$("#obListView").hidden=false;renderOnbList()}
function obDirty(){if(S.onb&&!S.onb.dirty){S.onb.dirty=true;obSaveBar()}}
function obSaveBar(){
  const P=S.onb;if(!P)return;
  const st=$("#obSaveState"),btn=$("#obSaveBtn"),back=$("#obBack");
  if(st){st.textContent=P.dirty?"Unsaved changes":`Saved ${when(P.doc.updatedAt)}`;st.className="pill "+(P.dirty?"warn":"ok")}
  if(btn)btn.disabled=!P.dirty||ro();
  if(back&&back.dataset.armed!=="1")back.textContent="← All documents";
  const rb=$("#obRemote");if(rb)rb.hidden=!P.remote;
}
function renderOnbEditor(){
  const P=S.onb,d=P.doc,R=ro(),edit=P.mode==="edit"&&!R,box=$("#obEditView");
  d.sections=d.sections||[];
  const back=el("button",{class:"btn ghost sm",id:"obBack"},"← All documents");
  back.addEventListener("click",()=>{
    if(!P.dirty)return closeOnb();
    if(back.dataset.armed!=="1"){back.dataset.armed="1";back.textContent="Discard unsaved changes?";setTimeout(()=>{back.dataset.armed="";obSaveBar()},3500);return}
    closeOnb();
  });
  const toggle=R?null:el("div",{class:"seg",role:"group","aria-label":"Mode"},
    el("button",{type:"button","aria-pressed":String(!edit),onclick:()=>{P.mode="view";renderOnbEditor()}},"View"),
    el("button",{type:"button","aria-pressed":String(edit),onclick:()=>{P.mode="edit";renderOnbEditor()}},"Edit"));
  const remote=el("div",{class:"banner",id:"obRemote",hidden:!P.remote},
    el("span",{text:"Someone else saved this document while you were editing. Saving now will replace their changes. "}),
    el("button",{class:"linkbtn",onclick:()=>{const p=S.onboarding.find(x=>x.id===P.id);if(p){S.onb={id:P.id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false,mode:P.mode};renderOnbEditor()}}},"Load their version"));
  let main;
  if(edit){
    const title=el("input",{type:"text",class:"title-in",id:"ob_title",value:d.title||"","aria-label":"Title"});
    title.addEventListener("input",()=>{d.title=title.value;obDirty()});
    const meta=el("div",{class:"fields"});
    for(const[f,lbl,t]of ONB_META){
      const id="ob_"+f;let inp;
      if(t==="cat"){inp=el("select",{id});for(const c of ONB_CATS)inp.append(el("option",{value:c},c));inp.value=d.category||"Other";inp.addEventListener("change",()=>{d.category=inp.value;obDirty()})}
      else{inp=el("input",{type:t==="date"?"date":"text",id,value:d[f]||""});inp.addEventListener("input",()=>{d[f]=inp.value;obDirty()})}
      meta.append(el("div",{class:"field"},el("label",{class:"label",for:id,text:lbl}),inp));
    }
    const summary=el("textarea",{id:"ob_summary",value:d.summary||"",style:"min-height:60px"});
    summary.addEventListener("input",()=>{d.summary=summary.value;obDirty()});
    const secs=el("div",{style:"display:grid;gap:12px"});
    d.sections.forEach((s,i)=>{
      const h=el("input",{type:"text",class:"sec-h",id:"ob_h"+i,value:s.heading||"",placeholder:"Section heading","aria-label":`Section ${i+1} heading`});
      h.addEventListener("input",()=>{s.heading=h.value;obDirty()});
      const b=el("textarea",{id:"ob_b"+i,value:s.body||"","aria-label":`Section ${i+1} text`});
      b.addEventListener("input",()=>{s.body=b.value;grow(b);obDirty()});
      const mv=(dir)=>{const j=i+dir;if(j<0||j>=d.sections.length)return;[d.sections[i],d.sections[j]]=[d.sections[j],d.sections[i]];obDirty();renderOnbEditor();const n=document.getElementById("ob_h"+j);if(n)n.scrollIntoView({block:"center"})};
      const del=el("button",{class:"btn ghost sm danger"},"Delete section");
      armDelete(del,"Delete section",()=>{d.sections.splice(i,1);obDirty();renderOnbEditor()});
      secs.append(el("div",{class:"sec-edit"},h,b,el("div",{class:"row",style:"gap:6px"},
        el("button",{class:"btn ghost sm",disabled:i===0,onclick:()=>mv(-1)},"Move up"),
        el("button",{class:"btn ghost sm",disabled:i===d.sections.length-1,onclick:()=>mv(1)},"Move down"),
        el("button",{class:"btn ghost sm",onclick:()=>{d.sections.splice(i+1,0,{heading:"",body:""});obDirty();renderOnbEditor();const n=document.getElementById("ob_h"+(i+1));if(n){n.scrollIntoView({block:"center"});n.focus()}}},"Add section below"),del)));
    });
    const notes=el("textarea",{id:"ob_notes",value:d.notes||"",style:"min-height:80px"});
    notes.addEventListener("input",()=>{d.notes=notes.value;obDirty()});
    main=[
      el("section",{class:"panel"},title,d.source?el("div",{class:"by",text:"Converted from "+d.source}):null,meta,
        el("div",{class:"field"},el("label",{class:"label",for:"ob_summary",text:"Summary"}),summary)),
      el("section",{class:"panel"},el("div",{class:"row spread"},el("h2",{text:"Sections"}),el("button",{class:"btn ghost sm",onclick:()=>{d.sections.push({heading:"",body:""});obDirty();renderOnbEditor()}},"Add section")),
        el("p",{class:"note",text:"Start a line with - for a bullet point, 1. for a numbered step, or [ ] for a tick box. Leave a blank line between paragraphs."}),secs),
      el("section",{class:"panel"},el("label",{class:"label",for:"ob_notes",text:"Notes and sign-off"}),notes)];
    requestAnimationFrame(()=>secs.querySelectorAll("textarea").forEach(grow));
  }else{
    const view=el("div",{class:"docview"});
    view.append(el("div",{class:"label",text:d.category||"Document"}),el("h2",{text:d.title||"Untitled document"}));
    const ml=[d.audience?"For: "+d.audience:"",d.owner?"Owner: "+d.owner:"",d.date?"Dated "+short(d.date):"",d.reviewDate?"Review "+short(d.reviewDate):""].filter(Boolean);
    if(ml.length)view.append(el("div",{class:"metaline"},...ml.map(t=>el("span",{text:t}))));
    if(d.summary)view.append(el("p",{class:"lead",text:d.summary}));
    const named=d.sections.map((s,i)=>[s,i]).filter(([s])=>s.heading);
    if(named.length>3)view.append(el("div",{class:"toc"},...named.map(([s,i])=>el("button",{type:"button",onclick:()=>{const n=document.getElementById("obs"+i);if(n)n.scrollIntoView({behavior:"smooth",block:"start"})}},s.heading))));
    d.sections.forEach((s,i)=>{if(s.heading)view.append(el("h3",{id:"obs"+i,text:s.heading}));if(s.body)view.append(renderBody(s.body))});
    if(!d.sections.some(s=>s.heading||s.body))view.append(el("p",{class:"note",text:R?"This document is empty.":"This document is empty. Switch to Edit to add content."}));
    if(d.notes){view.append(el("h3",{text:"Notes"}));view.append(renderBody(d.notes))}
    main=[el("section",{class:"panel"},d.source?el("div",{class:"by",text:"Converted from "+d.source}):null,view)];
  }
  const del=el("button",{class:"btn ghost danger"},"Delete document");
  armDelete(del,"Delete document",async()=>{if(await save(()=>D("onboarding",P.id).delete())){closeOnb();toast("Document deleted")}});
  const hist=(d.history||[]).slice(0,10);
  box.replaceChildren(
    el("div",{class:"row spread"},back,el("div",{class:"row",style:"gap:8px"},el("span",{class:"pill",text:d.category||"Document"}),toggle)),
    remote,...main,
    el("section",{class:"panel"},el("h3",{text:"History"}),
      hist.length?el("div",{},...hist.map(h=>el("div",{class:"by",text:`${when(h.at)} · ${h.what} · ${nameOf(h.by)}`}))):el("div",{class:"by",text:"No history yet."})),
    R?el("div",{class:"note",text:"You can read this document but not edit it."})
     :el("div",{class:"savebar"},el("span",{class:"pill",id:"obSaveState"}),el("div",{class:"row",style:"gap:8px"},del,el("button",{class:"btn",id:"obSaveBtn",onclick:saveOnb},"Save changes"))));
  obSaveBar();
  resolveNames(hist.map(h=>h.by));
}
async function saveOnb(){
  const P=S.onb;if(!P||!P.dirty||ro())return;
  const d=P.doc,now=Date.now();
  d.sections=(d.sections||[]).filter(s=>(s.heading||"").trim()||(s.body||"").trim());
  d.updatedBy=S.me;d.updatedAt=now;
  d.history=[{by:S.me,at:now,what:"Edited"},...(d.history||[])].slice(0,20);
  const body=clone(d);
  if(JSON.stringify(body).length>250000){toast("This document is too large to save. Split it into two documents.");return}
  P.baseAt=now;
  if(await save(()=>D("onboarding",P.id).set(body))){P.dirty=false;P.remote=false;obSaveBar();toast("Saved")}
}
function onOnbSnapshot(){
  renderOnbList();
  const P=S.onb;if(!P)return;
  const p=S.onboarding.find(x=>x.id===P.id);
  if(!p){if(!P.dirty){closeOnb();toast("That document was deleted.")}return}
  if(p.updatedAt!==P.baseAt){
    if(!P.dirty){S.onb={id:P.id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false,mode:P.mode};renderOnbEditor()}
    else{P.remote=true;obSaveBar()}
  }
}
(()=>{const s=$("#obKind");s.append(el("option",{value:"auto"},"Work it out from the document"));for(const c of ONB_CATS)s.append(el("option",{value:c},c))})();
$("#obFile").addEventListener("change",e=>setObFile(e.target.files[0]));
const obDrop=$("#obDrop");
["dragenter","dragover"].forEach(ev=>obDrop.addEventListener(ev,e=>{e.preventDefault();obDrop.classList.add("over")}));
["dragleave","drop"].forEach(ev=>obDrop.addEventListener(ev,e=>{e.preventDefault();obDrop.classList.remove("over")}));
obDrop.addEventListener("drop",e=>{const f=e.dataTransfer&&e.dataTransfer.files[0];if(f)setObFile(f)});
$("#obConvert").addEventListener("click",convertOnb);
$("#obStop").addEventListener("click",()=>obCtl&&obCtl.abort());
$("#obNewInduction").addEventListener("click",()=>newOnb(true));
$("#obNewBlank").addEventListener("click",()=>newOnb(false));
window.addEventListener("beforeunload",e=>{if(S.onb&&S.onb.dirty){e.preventDefault();e.returnValue=""}});

/* ---------- contacts ---------- */
const CON_TYPES=["Local council / environmental health","Pest control","Fridge & freezer engineer","Coffee machine technician","Equipment repairs","Gas engineer","Electrician","Plumber","Water supplier","Electricity supplier","Waste collection","Landlord / building manager","Insurance","Doctor / NHS 111","Key holder / manager","Other"];
const CON_FIELDS=[["type","Type","select"],["name","Name or company","text","e.g. City council food safety team"],["person","Contact person","text",""],["phone","Phone","tel",""],["outOfHours","Out-of-hours / emergency number","tel",""],["email","Email","email",""],["account","Account or reference number","text","e.g. contract no. for pest control"],["notes","Notes","text","e.g. Visits monthly; call for any sighting"]];
let editCon=null;
function conForm(){
  const box=$("#cForm");const f=el("div",{class:"fields"});
  for(const[k,lbl,type,ph]of CON_FIELDS){
    let inp;
    if(type==="select"){inp=el("select",{id:"c_"+k});for(const t of CON_TYPES)inp.append(el("option",{value:t},t))}
    else inp=el("input",{type,id:"c_"+k,placeholder:ph||""});
    f.append(el("div",{class:"field"+(k==="notes"?" wide":"")},el("label",{class:"label",for:"c_"+k,text:lbl}),inp));
  }
  const msg=el("span",{class:"by"});
  const cancel=el("button",{class:"btn ghost",hidden:true,onclick:()=>editContact(null)},"Cancel edit");
  const del=el("button",{class:"btn ghost danger",hidden:true},"Remove contact");
  armDelete(del,"Remove contact",async()=>{if(await save(()=>D("contacts",editCon).delete())){editContact(null);toast("Contact removed")}});
  const saveBtn=el("button",{class:"btn",onclick:async()=>{
    const v={};for(const[k]of CON_FIELDS)v[k]=$("#c_"+k).value.trim();
    if(!v.name){msg.textContent="Add a name or company first.";return}
    if(!v.phone&&!v.email&&!v.outOfHours){msg.textContent="Add a phone number or email so people can reach them.";return}
    v.by=S.me;v.at=Date.now();
    const ok=editCon?await save(()=>D("contacts",editCon).set(v)):await save(()=>C("contacts").add(v));
    if(ok){msg.textContent=`Saved ${v.name}.`;editContact(null)}
  }},"Save contact");
  box.append(f,el("div",{class:"row"},saveBtn,cancel,del,msg));box._cancel=cancel;box._del=del;box._msg=msg;
}
function editContact(c,typeOnly){
  editCon=c?c.id:null;$("#cFormTitle").textContent=c?"Edit "+c.name:"Add a contact";
  for(const[k]of CON_FIELDS)$("#c_"+k).value=c?(c[k]||(k==="type"?"Other":"")):(k==="type"?(typeOnly||CON_TYPES[0]):"");
  $("#cForm")._cancel.hidden=!c;$("#cForm")._del.hidden=!c;
  if(c||typeOnly){$("#cFormPanel").scrollIntoView({behavior:"smooth",block:"start"});$("#c_name").focus({preventScroll:true})}
}
function copyBtn(text){
  return el("button",{class:"btn ghost sm",onclick:async e=>{
    try{await navigator.clipboard.writeText(text);toast("Copied "+text)}
    catch(_){const r=document.createRange();r.selectNodeContents(e.target.previousSibling);const s=getSelection();s.removeAllRanges();s.addRange(r);toast("Number selected")}
  }},"Copy");
}
function renderContacts(){
  const box=$("#cList");box.replaceChildren();
  const order=t=>{const i=CON_TYPES.indexOf(t);return i<0?99:i};
  const list=[...S.contacts].sort((a,b)=>order(a.type)-order(b.type)||a.name.localeCompare(b.name));
  const p=$("#cPill");p.textContent=`${list.length} contact${list.length===1?"":"s"}`;p.className="pill "+(list.length?"ok":"");
  if(!list.length)box.append(el("div",{class:"empty",text:"No contacts yet. Start with your council's food safety team, pest control and your fridge engineer."}));
  let lastType=null;
  for(const c of list){
    if(c.type!==lastType){lastType=c.type;box.append(el("div",{class:"label",style:"padding-top:10px",text:c.type||"Other"}))}
    const nums=el("div",{class:"row",style:"gap:6px 14px"});
    if(c.phone)nums.append(el("span",{class:"row",style:"gap:6px"},el("span",{class:"mono",text:c.phone}),copyBtn(c.phone)));
    if(c.outOfHours)nums.append(el("span",{class:"row",style:"gap:6px"},el("span",{class:"by",text:"Out of hours:"}),el("span",{class:"mono",text:c.outOfHours}),copyBtn(c.outOfHours)));
    box.append(el("div",{class:"card"},
      el("div",{class:"row spread"},el("h3",{text:c.name}),ro()?null:el("button",{class:"btn ghost sm",onclick:()=>editContact(c)},"Edit")),
      c.person?el("div",{text:c.person}):null,
      (c.phone||c.outOfHours)?nums:null,
      c.email?el("div",{class:"by",text:c.email}):null,
      (c.account||c.notes)?el("div",{class:"by",text:[c.account?"Ref: "+c.account:"",c.notes].filter(Boolean).join(" · ")}):null));
  }
  const have=new Set(list.map(c=>c.type));
  const sug=$("#cSuggest");sug.replaceChildren();
  const missing=["Local council / environmental health","Pest control","Fridge & freezer engineer","Coffee machine technician","Gas engineer","Electrician","Plumber","Water supplier","Doctor / NHS 111","Key holder / manager"].filter(t=>!have.has(t));
  for(const t of missing)sug.append(el("button",{class:"btn ghost sm",onclick:()=>editContact(null,t)},"+ "+t));
  $("#cSuggestPanel").hidden=ro()||!missing.length;
  $("#cFormPanel").hidden=ro();
}

/* ---------- staff training ---------- */
function staffForm(){
  const box=$("#tTopics");
  for(const[k,lbl]of TOPICS)box.append(el("div",{class:"field"},el("label",{class:"label",for:"tt_"+k,text:lbl}),el("input",{type:"date",id:"tt_"+k})));
  const sb=$("#tSites");
  const all=el("input",{type:"checkbox",id:"ts_all"});
  sb.append(el("label",{for:"ts_all"},all,el("strong",{text:"All sites"})));
  for(const x of SITES)sb.append(el("label",{for:"ts_"+x.id},el("input",{type:"checkbox",id:"ts_"+x.id,"data-site":x.id}),x.name));
  const boxes=()=>[...sb.querySelectorAll("input[data-site]")];
  all.addEventListener("change",()=>boxes().forEach(b=>b.checked=all.checked));
  sb.addEventListener("change",e=>{if(e.target!==all)all.checked=boxes().every(b=>b.checked)});
  $("#tSave").addEventListener("click",async()=>{
    const name=$("#tName").value.trim();if(!name){$("#tMsg").textContent="Add the person's name first.";return}
    const sites=boxes().filter(b=>b.checked).map(b=>b.dataset.site);
    if(!sites.length){$("#tMsg").textContent="Tick at least one site to save to.";return}
    const old=S.editStaff?S.staff.find(x=>x.id===S.editStaff):null;
    const topics={};
    for(const[k]of TOPICS){const d=$("#tt_"+k).value;if(d){const prev=old&&old.topics&&old.topics[k];topics[k]=prev&&prev.date===d?prev:{date:d,by:S.me}}}
    const personId=(old&&old.personId)||("p"+Date.now().toString(36)+Math.random().toString(36).slice(2,6));
    const v={name,role:$("#tRole").value.trim(),start:$("#tStart").value,topics,notes:$("#tNotes").value.trim(),personId,sites,at:Date.now()};
    const key=normT(old?old.name:name),editId=S.editStaff,here=S.site;
    $("#tSave").disabled=true;$("#tMsg").textContent="Saving…";
    const done=[];
    for(const site of sites){
      const ok=await save(async()=>{
        if(site===here&&editId)return D("staff",editId,site).set(v);
        const snap=await C("staff",site).get();
        const m=snap.docs.find(d=>{const x=d.data()||{};return x.personId===personId||normT(x.name)===key});
        return m?D("staff",m.id,site).set(v):C("staff",site).add(v);
      });
      if(ok)done.push(siteOf(site).name);
    }
    $("#tSave").disabled=ro();
    if(done.length){editStaff(null);$("#tMsg").textContent=`Saved ${name} to ${done.join(", ")}.`+(done.length<sites.length?" Some sites couldn't be saved; try again.":"")}
  });
  $("#tCancel").addEventListener("click",()=>editStaff(null));
  armDelete($("#tDelete"),"Remove person",async()=>{if(await save(()=>D("staff",S.editStaff).delete())){editStaff(null);toast("Removed")}});
}
function editStaff(p){
  S.editStaff=p?p.id:null;$("#tFormTitle").textContent=p?"Edit "+p.name:"Add a staff member";
  $("#tName").value=p?p.name:"";$("#tRole").value=p?(p.role||""):"";$("#tStart").value=p?(p.start||""):"";$("#tNotes").value=p?(p.notes||""):"";
  for(const[k]of TOPICS)$("#tt_"+k).value=p&&p.topics&&p.topics[k]?p.topics[k].date:"";
  const on=p&&Array.isArray(p.sites)&&p.sites.length?p.sites:[S.site];
  document.querySelectorAll("#tSites input[data-site]").forEach(b=>b.checked=on.includes(b.dataset.site)||b.dataset.site===S.site&&!!p);
  $("#ts_all").checked=[...document.querySelectorAll("#tSites input[data-site]")].every(b=>b.checked);
  $("#tCancel").hidden=!p;$("#tDelete").hidden=!p;
  if(p)$("#tFormPanel").scrollIntoView({behavior:"smooth",block:"start"});
}
function renderStaff(){
  const box=$("#tMatrix");box.replaceChildren();
  const list=[...S.staff].sort((a,b)=>a.name.localeCompare(b.name));
  const gaps=list.filter(p=>TOPICS.some(([k])=>!(p.topics&&p.topics[k]))).length;
  const pl=$("#tPill");pl.textContent=list.length?(gaps?`${gaps} with training to do`:"Everyone trained"):"No staff yet";pl.className="pill "+(!list.length?"":gaps?"warn":"ok");
  if(!list.length){box.append(el("div",{class:"empty",text:"No one listed yet. Add each member of staff below with the dates they were trained."}))}
  else{
    const head=el("tr",{},el("th",{text:"Name"}),...TOPICS.map(([,l])=>el("th",{class:"al",text:l})));
    const tb=el("tbody");
    for(const p of list){
      tb.append(el("tr",{},
        el("td",{},el("div",{style:"font-weight:600",text:p.name}),el("div",{class:"by",text:[p.role,p.start?"started "+short(p.start):""].filter(Boolean).join(" · ")}),
          Array.isArray(p.sites)&&p.sites.length>1?el("div",{class:"by",text:"Sites: "+p.sites.map(x=>siteOf(x).name).join(", ")}):null,
          p.notes?el("div",{class:"by",text:p.notes}):null,
          ro()?null:el("button",{class:"btn ghost sm",style:"margin-top:4px",onclick:()=>editStaff(p)},"Edit")),
        ...TOPICS.map(([k])=>{const t=p.topics&&p.topics[k];return el("td",{class:"dt"+(t?"":" no"),text:t?short(t.date):"–"})})));
    }
    box.append(el("div",{class:"scroll"},el("table",{class:"matrix"},el("thead",{},head),tb)));
  }
  $("#tFormPanel").hidden=ro();
}

/* ---------- allergens ---------- */
function renderAllergens(){
  const box=$("#algMatrix");box.replaceChildren();
  if(!S.allergens.length){box.append(el("div",{class:"empty",text:"No menu items yet. Add your first item below, then tick the allergens it contains."}))}
  else{
    const head=el("tr",{},el("th",{text:"Item"}),...ALLERGENS.map(a=>el("th",{class:"al",text:a})),el("th",{text:"Notes"}));
    const tb=el("tbody");
    for(const it of [...S.allergens].sort((a,b)=>a.name.localeCompare(b.name))){
      const has=new Set(it.contains||[]);
      tb.append(el("tr",{},
        el("td",{},el("div",{style:"font-weight:600",text:it.name}),el("div",{class:"by",text:(it.source?it.source+" · ":"")+(it.at?"checked "+new Date(it.at).toLocaleDateString("en-GB"):"")+(it.importedFrom?` · copied from ${siteOf(it.importedFrom).name}`:"")}),
          ro()?null:el("button",{class:"btn ghost sm",style:"margin-top:4px",onclick:()=>editAlg(it)},"Edit")),
        ...ALLERGENS.map(a=>el("td",{class:"c",text:has.has(a)?"●":""})),
        el("td",{text:it.notes||"",style:"min-width:160px"})));
    }
    box.append(el("div",{class:"scroll"},el("table",{class:"matrix"},el("thead",{},head),tb)));
  }
  $("#algFormPanel").hidden=ro();
}
function buildAlgChecks(){
  const c=$("#algChecks");
  ALLERGENS.forEach((a,i)=>{const id="alg_"+i;c.append(el("label",{for:id},el("input",{type:"checkbox",id,value:a}),a))});
}
function editAlg(it){
  S.editAlg=it?it.id:null;
  $("#algFormTitle").textContent=it?"Edit "+it.name:"Add a menu item";
  $("#algName").value=it?it.name:"";$("#algSupplier").value=it?(it.source||""):"";$("#algNotes").value=it?(it.notes||""):"";
  const has=new Set(it?it.contains||[]:[]);
  document.querySelectorAll("#algChecks input").forEach(cb=>cb.checked=has.has(cb.value));
  $("#algCancel").hidden=!it;$("#algDelete").hidden=!it;
  if(it)$("#algFormPanel").scrollIntoView({behavior:"smooth",block:"start"});
}

/* ---------- review ---------- */
function reviewPeriod(){
  const last=S.reviews[0];
  const start=last?last.date:(S.settings.startDate||Object.keys(S.days).sort()[0]||today());
  return{start,due:addDays(start,28)};
}
function renderReview(){
  const{start,due}=reviewPeriod();const t=today();
  const p=$("#revDue");const left=Math.round((parse(due)-parse(t))/864e5);
  p.textContent=left<0?`Overdue since ${nice(due)}`:left===0?"Due today":`Next due ${nice(due)} (${left} days)`;
  p.className="pill "+(left<0?"bad":left<=3?"warn":"ok");
  let comp=0,days=0,temps=0;
  for(let dt=start;dt<=t;dt=addDays(dt,1)){const st=dayStatus(S.days[dt]);if(isClosed(dt)&&!st.any)continue;days++;if(st.complete)comp++;if(st.issue)temps++}
  const xOver=S.extras.filter(x=>taskState(x).overdue).length,kOver=S.cleaning.filter(x=>taskState(x).overdue).length;
  const pFail=S.prove.filter(r=>r.date>=start&&r.pass===false).length;
  const untrained=S.staff.filter(p=>TOPICS.some(([k])=>!(p.topics&&p.topics[k]))).length;
  $("#revSummary").replaceChildren(
    el("span",{class:"pill",text:`Since ${nice(start)}`}),
    el("span",{class:"pill "+(comp===days?"ok":"warn"),text:`${comp}/${days} days complete`}),
    el("span",{class:"pill "+(temps?"bad":"ok"),text:`${temps} day${temps===1?"":"s"} with temperature problems`}),
    el("span",{class:"pill "+(pFail?"bad":"ok"),text:`${pFail} failed Prove it check${pFail===1?"":"s"}`}),
    el("span",{class:"pill "+(kOver?"bad":"ok"),text:`${kOver} cleaning task${kOver===1?"":"s"} overdue`}),
    el("span",{class:"pill "+(xOver?"bad":"ok"),text:`${xOver} extra check${xOver===1?"":"s"} overdue`}),
    el("span",{class:"pill "+(untrained?"warn":"ok"),text:`${untrained} staff with training to do`}),
    (()=>{const n=S.plans.filter(d=>reviewState(d).overdue).length;return el("span",{class:"pill "+(n?"bad":"ok"),text:`${n} HACCP/risk document${n===1?"":"s"} overdue for review`})})(),
    (()=>{const l=inspSorted()[0];if(!l)return "";const n=(l.issues||[]).filter(i=>!i.done).length;return el("span",{class:"pill "+(n?"bad":"ok"),text:`${n} EHO issue${n===1?"":"s"} still open`})})());
  const qs=$("#revQs");qs.replaceChildren();
  for(const[k,q]of REVIEW_QS){
    const cur=S.rev[k]||{};
    const seg=el("div",{class:"seg",role:"group","aria-label":q});
    for(const v of["Yes","No"])seg.append(el("button",{type:"button","aria-pressed":String(cur.a===v),disabled:ro(),onclick:()=>{S.rev[k]={...cur,a:v};renderReview()}},v));
    const det=el("input",{type:"text",id:"rq_"+k,placeholder:"Details (what changed, what you did)",value:cur.d||"",disabled:ro()});
    det.addEventListener("input",()=>{S.rev[k]={...(S.rev[k]||{}),d:det.value}});
    qs.append(el("div",{class:"qa"},el("div",{class:"row spread"},el("span",{text:q}),seg),cur.a==="Yes"||cur.d?det:null));
  }
  $("#revSave").disabled=ro();$("#revNotes").disabled=ro();
  const list=$("#revList");list.replaceChildren();
  if(!S.reviews.length)list.append(el("div",{class:"empty",text:"No reviews signed yet. Your first one is due "+nice(due)+"."}));
  for(const r of S.reviews){
    const yes=REVIEW_QS.filter(([k])=>r.answers&&r.answers[k]&&r.answers[k].a==="Yes");
    list.append(el("div",{class:"qa"},
      el("div",{class:"row spread"},el("strong",{text:nice(r.date)}),el("span",{class:"by",text:"Signed by "+nameOf(r.by)})),
      el("div",{class:"note",text:yes.length?"Yes to: "+yes.map(([k,q])=>q+(r.answers[k].d?` (${r.answers[k].d})`:"")).join(" "):"No changes recorded."}),
      r.notes?el("div",{class:"note",text:"Actions: "+r.notes}):null));
  }
  resolveNames(S.reviews.map(r=>r.by));
}

/* ---------- allergen PDFs ---------- */
let adFile=null,adBusy=false;
const kb=n=>n>=1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
function setAdFile(f){
  if(f&&!(f.type==="application/pdf"||/\.pdf$/i.test(f.name))){$("#adMsg").textContent="Choose a PDF file.";f=null}
  adFile=f||null;$("#adDropText").textContent=adFile?adFile.name:"Drop a PDF here, or choose one";
  if(adFile&&!$("#adTitle").value.trim())$("#adTitle").value=adFile.name.replace(/\.pdf$/i,"");
  if(adFile)$("#adMsg").textContent="";
  $("#adSave").disabled=!adFile||adBusy;
}
function renderAllergenDocs(){
  const box=$("#adList");box.replaceChildren();const ids=[];
  const list=[...S.allergenDocs].sort((a,b)=>(b.at||0)-(a.at||0));
  const p=$("#adPill");p.textContent=list.length?`${list.length} PDF${list.length===1?"":"s"}`:"None yet";p.className="pill "+(list.length?"ok":"");
  if(!list.length)box.append(el("div",{class:"empty",text:`No allergen PDF uploaded for the ${curSite().name} yet.`}));
  list.forEach((d,i)=>{
    ids.push(d.by);
    const url="/_blob/"+d.assetId;
    let del=null;
    if(!ro()&&S.assets){
      del=el("button",{class:"btn ghost sm danger"},"Remove");
      armDelete(del,"Remove",async()=>{
        if(await save(()=>D("allergenDocs",d.id).delete())){try{await S.assets.delete(d.assetId)}catch(e){}toast("PDF removed")}
      });
    }
    box.append(el("div",{class:"plan-card"},
      el("div",{style:"min-width:0"},el("a",{class:"open",href:url,target:"_blank",rel:"noopener",style:"text-decoration:none;display:inline-block"},d.title||d.fileName||"Allergen information"),
        el("div",{class:"by",text:[d.fileName,d.size?kb(d.size):"",`uploaded ${when(d.at)} by ${nameOf(d.by)}`].filter(Boolean).join(" · ")}),
        d.note?el("div",{class:"by",text:d.note}):null),
      el("div",{class:"row",style:"gap:6px"},i===0?el("span",{class:"pill ok",text:"Latest"}):null,
        el("a",{class:"btn ghost sm",href:url,target:"_blank",rel:"noopener",style:"text-decoration:none"},"Open PDF"),del)));
  });
  const can=!ro()&&!!S.assets;
  $("#adUpload").hidden=!can;$("#adNoUpload").hidden=can||!S.db;
  resolveNames(ids);
}
async function uploadAllergenPdf(){
  if(!adFile||!S.assets||ro()||adBusy)return;
  if(adFile.size>20*1024*1024){$("#adMsg").textContent="That PDF is over 20 MB. Upload a smaller version.";return}
  const site=S.site,file=adFile;adBusy=true;$("#adSave").disabled=true;$("#adMsg").textContent="Uploading…";
  try{
    const up=await S.assets.upload(file,{type:"application/pdf"});
    const doc={title:$("#adTitle").value.trim()||file.name.replace(/\.pdf$/i,""),note:$("#adNote").value.trim(),fileName:file.name,assetId:up.id,size:up.sizeBytes||file.size,by:S.me,at:Date.now()};
    try{await C("allergenDocs",site).add(doc)}catch(e){try{await S.assets.delete(up.id)}catch(_){}throw e}
    adBusy=false;$("#adTitle").value="";$("#adNote").value="";$("#adFile").value="";setAdFile(null);
    $("#adMsg").textContent=`Uploaded to the ${siteOf(site).name}.`;
  }catch(e){
    adBusy=false;const c=e&&e.code;
    $("#adMsg").textContent=c==="too_large"?"That PDF is too large (20 MB limit).":c==="unsupported_type"?"That file couldn't be stored as a PDF. Try saving it as a PDF again.":c==="quota_or_state"?"The diary's file storage is full. Remove an old PDF and try again.":c==="rate_limited"?"Too many uploads just now. Wait a minute and try again.":c==="invalid_argument"?"You don't have permission to add files to this diary.":"Couldn't upload the PDF. Check your connection and try again.";
    $("#adSave").disabled=!adFile;
  }
}
$("#adFile").addEventListener("change",e=>setAdFile(e.target.files[0]));
(()=>{const dz=$("#adDrop");
  ["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("over")}));
  ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("over")}));
  dz.addEventListener("drop",e=>{const f=e.dataTransfer&&e.dataTransfer.files[0];if(f)setAdFile(f)});})();
$("#adSave").addEventListener("click",uploadAllergenPdf);

/* ---------- needs attention (per site) ---------- */
function prevTradingDay(s,days){
  for(let i=1;i<=7;i++){const d=addDays(today(),-i);if(!isClosed(d,s)||(days[d]&&dayStatus(days[d],activeCfg(s)).any))return d}
  return null;
}
function siteAttention(id){
  const sm=S.sum[id];if(!sm||!sm.ready)return null;
  const s=sm.settings,cfg=activeCfg(s),t=today();
  const st=dayStatus(sm.days[t],cfg),closedToday=isClosed(t,s)&&!st.any;
  const prev=prevTradingDay(s,sm.days),pd=prev?sm.days[prev]:null,pst=prev?dayStatus(pd,cfg):null;
  const tasks=[];
  for(const kind of["cleaning","extras"]){
    if(!tabOn(kind,s))continue;
    for(const x of sm[kind]){const ts=taskState(x);if(ts.overdue)tasks.push({kind,t:x,ts})}
  }
  tasks.sort((a,b)=>(a.t.lastAt||0)-(b.t.lastAt||0));
  let openDue=!closedToday&&cfg.opening.length>0&&st.open!=="y";
  const dayKeys=Object.keys(sm.days).sort();
  const start=s.startDate||dayKeys[0]||null;
  const unused=s.fresh&&!dayKeys.length;
  const prevDue=!unused&&!!prev&&!!start&&prev>=start&&!(pd&&pd.signed);
  if(unused)openDue=false;
  return{id,s,cfg,t,st,closedToday,prev,pd,pst,tasks,openDue,prevDue,unused,start,count:(openDue?1:0)+(prevDue?1:0)+tasks.length};
}
function dueDate(t){const n=FREQ[t.freq],b=t.lastAt||t.importedAt;if(!b||!n)return"";const d=new Date(b);d.setDate(d.getDate()+n);return iso(d)}
function goDay(date,anchor){
  S.date=date;show("day");renderDay();renderHead();
  requestAnimationFrame(()=>{const n=$(anchor||"#openList");if(n)n.scrollIntoView({behavior:"smooth",block:"center"})});
}
function attRow(siteName,title,sub,pill,actions){
  return el("div",{class:"att-row"},
    el("div",{class:"what"},el("strong",{},el("span",{class:"sitetag",text:siteName}),title),sub?el("span",{class:"by",text:sub}):null),
    el("div",{class:"act"},pill,...actions));
}
function renderAttention(){
  const box=$("#attList"),panel=$("#attention");
  panel.hidden=!S.db||S.tab!=="day";if(!S.db)return;
  const site=curSite(),a=siteAttention(S.site);
  $("#attTitle").textContent=`${site.name}: needs attention`;
  box.replaceChildren();
  const pill=$("#attPill");
  if(!a){pill.textContent="Loading…";pill.className="pill";return}
  pill.textContent=a.unused?"Not started":a.count?`${a.count} to action`:"All clear";pill.className="pill "+(a.unused?"":a.count?"bad":"ok");
  const R=ro(),tNice=nice(a.t);
  const mk=(cls,text)=>el("span",{class:"pill "+cls,text});
  const part=(n,tot,label)=>n>=tot?mk("ok","Done"):n?mk("warn",`${n} of ${tot} ticked`):mk(label==="close"?"warn":"bad",label==="close"?"Not done yet":"Not started");
  if(a.unused){
    box.append(attRow(site.name,"Not in use yet",`No diary entries or setup saved for the ${site.name} yet. Nothing is counted as missing until it starts.`,mk("","Not started"),
      [el("button",{class:"btn ghost sm",onclick:()=>show("setup")},"Set up"),el("button",{class:"btn ghost sm",onclick:()=>goDay(a.t,"#openList")},"Open today")]));
    return;
  }
  // opening & closing today
  if(a.closedToday){
    box.append(attRow(site.name,"Opening & closing checks",`Today, ${tNice}`,mk("","Closed today"),[]));
  }else{
    box.append(attRow(site.name,"Opening checks",`Today, ${tNice}`,a.cfg.opening.length?part(a.st.oN,a.cfg.opening.length,"open"):mk("","None set up"),
      [el("button",{class:"btn ghost sm",onclick:()=>goDay(a.t,"#openList")},a.st.open==="y"?"View":"Open")]));
    box.append(attRow(site.name,"Closing checks",`Today, ${tNice}`,a.cfg.closing.length?part(a.st.cN,a.cfg.closing.length,"close"):mk("","None set up"),
      [el("button",{class:"btn ghost sm",onclick:()=>goDay(a.t,"#closeList")},a.st.close==="y"?"View":"Open")]));
  }
  // previous day sign-off
  if(a.prev&&a.start&&a.prev>=a.start){
    const sg=a.pd&&a.pd.signed;const ps=a.pst;
    const gaps=[];if(ps.open!=="y")gaps.push(`opening ${ps.oN}/${a.cfg.opening.length}`);if(ps.close!=="y")gaps.push(`closing ${ps.cN}/${a.cfg.closing.length}`);if(ps.tN<ps.tTot)gaps.push(`temps ${ps.tN}/${ps.tTot}`);
    box.append(attRow(site.name,"Previous day's sign-off",nice(a.prev)+(sg?` · signed by ${sg.name||nameOf(sg.by)}`:gaps.length?" · still to do: "+gaps.join(", "):""),
      sg?mk("ok","Signed off"):mk("bad","Not signed off"),
      sg?[]:[el("button",{class:"btn sm",disabled:R,onclick:()=>goDay(a.prev,"#signArea")},"Open & sign off")]));
  }
  // overdue cleaning jobs & extra checks
  for(const{kind,t,ts}of a.tasks){
    const due=dueDate(t);
    box.append(attRow(site.name,`${kind==="cleaning"?"Cleaning":"Extra check"}: ${t.name}`,
      [due?`Was due ${nice(due)}`:"Never recorded as done",t.lastAt?`last done ${when(t.lastAt)}`:"",(t.freq||"").replace(/^./,c=>c.toUpperCase()),t.who?"Who: "+t.who:""].filter(Boolean).join(" · "),
      mk("bad",ts.text),
      [el("button",{class:"btn sm",disabled:R,onclick:()=>completeTask(kind,t,a.id,"")},"Mark done"),el("button",{class:"btn ghost sm",onclick:()=>show(kind)},"Open")]));
  }
  if(!a.tasks.length&&tabOn("cleaning",a.s))box.append(attRow(site.name,"Cleaning schedule & extra checks","Nothing overdue",mk("ok","Up to date"),[]));
}
/* ---------- app chrome: sites, sections, account ---------- */
const svgi=(d)=>{const n=document.createElementNS("http://www.w3.org/2000/svg","svg");n.setAttribute("viewBox","0 0 24 24");n.setAttribute("class","i");n.setAttribute("aria-hidden","true");n.innerHTML=d;return n};
const ICON={
  today:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="M9 14.5l2 2 4-4"/>',
  week:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
  history:'<path d="M4 12a8 8 0 108-8 8.5 8.5 0 00-6 2.5L4 8"/><path d="M4 4v4h4M12 8v4l3 2"/>',
  records:'<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  extras:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  cleaning:'<path d="M9 9h6v12H9zM10 9V6h4v3M14 4h3M16 2v4"/>',
  prove:'<path d="M10 14V5a2 2 0 014 0v9a4 4 0 11-4 0z"/>',
  allergens:'<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15zM5 19l7-7"/>',
  eho:'<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  plans:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/>',
  suppliers:'<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  contacts:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z"/>',
  staff:'<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 11a3 3 0 100-6M21 20c0-3-1.8-5.2-4.5-5.8"/>',
  onboarding:'<path d="M5 4h6a3 3 0 013 3v13a2 2 0 00-2-2H5zM19 4h-5v14h5z"/>',
  review:'<path d="M12 4l2.5 5.2 5.5.8-4 4 1 5.6L12 17l-5 2.6 1-5.6-4-4 5.5-.8z"/>',
  setup:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  chevD:'<path d="M6 9l6 6 6-6"/>',chevR:'<path d="M9 6l6 6-6 6"/>',chevL:'<path d="M15 6l-6 6 6 6"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3"/>',shield:'<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  out:'<path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
};
// Every section, in order. grp: where it lives (diary sections are tabs; records and manage are lists on phones).
const NAV=[
  {id:"day",t:"Today",grp:"diary",ic:"today"},{id:"week",t:"This week",grp:"diary",ic:"week"},{id:"history",t:"Last 4 weeks",grp:"manage",ic:"history",sub:"Days complete, gaps and problems"},
  {id:"extras",t:"Extra checks",grp:"records",ic:"extras",tile:"teal"},{id:"cleaning",t:"Cleaning",grp:"records",ic:"cleaning",tile:"blue"},
  {id:"prove",t:"Prove it",grp:"records",ic:"prove",tile:"orange"},{id:"allergens",t:"Allergens",grp:"records",ic:"allergens",tile:"red"},
  {id:"eho",t:"EHO inspection",grp:"manage",ic:"eho",tile:"green"},{id:"plans",t:"HACCP & risk",grp:"manage",ic:"plans",tile:"purple"},
  {id:"suppliers",t:"Suppliers",grp:"manage",ic:"suppliers",tile:"orange"},{id:"contacts",t:"Contacts",grp:"manage",ic:"contacts",tile:"green"},
  {id:"staff",t:"Staff training",grp:"manage",ic:"staff",tile:"teal"},{id:"onboarding",t:"Onboarding",grp:"manage",ic:"onboarding",tile:"indigo"},
  {id:"review",t:"4-weekly review",grp:"manage",ic:"review",tile:"red"},{id:"setup",t:"Setup",grp:"manage",ic:"setup",tile:"grey"},
];
const navOf=id=>NAV.find(n=>n.id===id);
// Sections only managers and admins use. The Worker enforces the same rule on saves (src/access.ts).
const MANAGER_TABS=new Set(["eho","plans","suppliers","contacts","staff","onboarding","review","setup"]);
const roleAllows=t=>S.role!=="staff"||!MANAGER_TABS.has(t);
const canTab=t=>t==="records"||t==="more"||(tabOn(t)&&roleAllows(t));
const initials=n=>String(n||"?").split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join("").toUpperCase();
function siteState(id){
  const a=siteAttention(id);
  if(!S.db||!a)return{cls:"",text:"…"};
  if(a.unused)return{cls:"",text:"Not in use"};
  return a.count?{cls:"bad",text:`${a.count} to do`}:{cls:"ok",text:"All clear"};
}
// Small status shown beside a section in lists ("1 overdue").
function navBadge(id){
  if(id==="cleaning"||id==="extras"){const n=S[id].filter(x=>taskState(x).overdue).length;return n?{cls:"bad",text:`${n} overdue`}:null}
  return null;
}
function renderSites(){
  const st=siteState(S.site);
  document.querySelectorAll("[data-sitebtn]").forEach(b=>{
    b.replaceChildren(el("span",{class:"sdot "+st.cls}),el("span",{class:"sname",text:curSite().name}),svgi(ICON.chevD));
    b.setAttribute("aria-label",`Site: ${curSite().name}. Change site`);
  });
  const box=$("#siteList");box.replaceChildren();
  for(const x of SITES){
    const s=siteState(x.id),sm=S.sum[x.id];
    box.append(el("button",{class:"lrow"+(x.id===S.site?" on":""),type:"button","aria-current":x.id===S.site?"true":null,onclick:()=>{closeSheets();switchSite(x.id)}},
      el("span",{class:"sdot big "+s.cls}),el("span",{class:"t"},el("b",{text:x.name}),el("span",{class:"s",text:siteAddr(x.id,sm&&sm.settings)})),
      S.db?el("span",{class:"pill "+s.cls,text:s.text}):null));
  }
}
function navRow(n,onclick){
  const b=navBadge(n.id);
  return el("button",{class:"lrow",type:"button",onclick},el("span",{class:"tile "+(n.tile||"blue")},svgi(ICON[n.ic])),
    el("span",{class:"t"},el("b",{text:n.t}),n.sub?el("span",{class:"s",text:n.sub}):null),b?el("span",{class:"pill "+b.cls,text:b.text}):null,el("span",{class:"chev"},svgi(ICON.chevR)));
}
function renderNav(){
  const vis=NAV.filter(n=>canTab(n.id));
  // sidebar
  const sn=$("#snav");sn.replaceChildren();
  const groups=[["diary",""],["records","Records"],["manage","Management"]];
  for(const[g,label]of groups){
    const items=vis.filter(n=>n.grp===g||(g==="diary"&&n.id==="history"));
    if(g==="manage")items.splice(0,items.length,...vis.filter(n=>n.grp==="manage"&&n.id!=="history"));
    if(!items.length)continue;
    if(label)sn.append(el("div",{class:"h",text:label}));
    for(const n of items){const b=navBadge(n.id);
      sn.append(el("a",{href:"#"+n.id,class:S.tab===n.id?"on":"","aria-current":S.tab===n.id?"page":null,onclick:e=>{e.preventDefault();show(n.id)}},svgi(ICON[n.ic]),el("span",{text:n.t}),b?el("span",{class:"n pill "+b.cls,text:b.text.split(" ")[0]}):null));}
  }
  // tab bar
  const grpOf=t=>t==="records"||(navOf(t)||{}).grp==="records"?"records":t==="more"||(navOf(t)||{}).grp==="manage"?"more":t;
  const cur=grpOf(S.tab);
  const recCount=vis.filter(n=>n.grp==="records").reduce((k,n)=>k+(navBadge(n.id)?1:0),0);
  const tb=$("#tabbar");tb.replaceChildren();
  for(const[t,label,ic]of[["day","Today","today"],["week","Week","week"],["records","Records","records"],["more","More","more"]]){
    if(!canTab(t))continue;
    tb.append(el("button",{type:"button",class:"tab"+(cur===t?" on":""),"aria-current":cur===t?"page":null,onclick:()=>show(t)},svgi(ICON[ic]),el("span",{text:label}),t==="records"&&recCount?el("span",{class:"n",text:String(recCount)}):null));
  }
  // Records and More pages
  const rh=$("#recordsHub");rh.replaceChildren(...vis.filter(n=>n.grp==="records").map(n=>navRow(n,()=>show(n.id))));
  const mh=$("#moreHub");mh.replaceChildren();
  const mg=vis.filter(n=>n.grp==="manage");
  if(mg.length){const hist=mg.filter(n=>n.id==="history"),rest=mg.filter(n=>n.id!=="history");
    if(hist.length)mh.append(el("div",{class:"list glass"},...hist.map(n=>navRow(n,()=>show(n.id)))));
    if(rest.length)mh.append(el("div",{class:"label",text:"Management"}),el("div",{class:"list glass"},...rest.map(n=>navRow(n,()=>show(n.id)))));}
  mh.append(el("div",{class:"label",text:"Account"}),el("div",{class:"list glass"},...accountItems().map(([t,ic,tile,fn,danger])=>
    el("button",{class:"lrow"+(danger?" danger":""),type:"button",onclick:fn},el("span",{class:"tile "+tile},svgi(ICON[ic])),el("span",{class:"t"},el("b",{text:t}),danger&&S.myName?el("span",{class:"s",text:"Signed in as "+S.myName}):null)))));
}
function accountItems(){
  return[["Change password","key","grey",()=>{location.href="/signin#change"}],
    ...(S.role==="admin"?[["Admin","shield","blue",()=>{location.href="/admin"}]]:[]),
    ["Sign out","out","red",signOut,true]];
}
async function signOut(){try{await fetch("/api/auth/logout",{method:"POST"})}catch(e){}location.replace("/signin")}
function renderMe(){
  $("#avatarBtn").textContent=initials(S.myName);
  $("#meBox").replaceChildren(el("span",{class:"avatar sm",text:initials(S.myName)}),
    el("span",{class:"t"},el("b",{text:S.myName||"Signed in"}),el("span",{class:"s",text:{admin:"Admin",manager:"Manager",staff:"Staff"}[S.role]||""})),svgi(ICON.chevR));
}
/* sheets and the account menu */
function closeSheets(){$("#sheetVeil").hidden=true;$("#siteSheet").hidden=true;$("#acctMenu").hidden=true}
function openSiteSheet(){renderSites();$("#sheetVeil").hidden=false;$("#siteSheet").hidden=false;const on=$("#siteList .on")||$("#siteList button");if(on)on.focus()}
function openAcctMenu(anchor){
  const m=$("#acctMenu");
  m.replaceChildren(el("div",{class:"who"},el("b",{text:S.myName||""}),el("span",{class:"s",text:{admin:"Admin",manager:"Manager",staff:"Staff"}[S.role]||""})),
    ...accountItems().map(([t,ic,,fn,danger])=>el("button",{class:"m"+(danger?" danger":""),type:"button",role:"menuitem",onclick:()=>{closeSheets();fn()}},svgi(ICON[ic]),el("span",{text:t}))));
  const r=anchor.getBoundingClientRect();
  m.style.top=(r.bottom+8)+"px";m.style.left=Math.max(12,Math.min(r.left,innerWidth-272))+"px";
  if(anchor.id==="meBox"){m.style.top="";m.style.bottom=(innerHeight-r.top+8)+"px"}else m.style.bottom="";
  $("#sheetVeil").hidden=false;m.hidden=false;m.querySelector("button").focus();
}
document.querySelectorAll("[data-sitebtn]").forEach(b=>b.addEventListener("click",openSiteSheet));
$("#avatarBtn").addEventListener("click",e=>openAcctMenu(e.currentTarget));
$("#meBox").addEventListener("click",e=>openAcctMenu(e.currentTarget));
$("#sheetVeil").addEventListener("click",closeSheets);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#sheetVeil").hidden)closeSheets()});

/* ---------- setup (per site) & publishing ---------- */
let SE=null,setupDirty=false;
const normT=t=>String(t||"").trim().toLowerCase().replace(/\s+/g," ");
function setupDraft(){const s=S.settings;return JSON.parse(JSON.stringify({info:s.info||{},closedDays:s.closedDays,hide:s.hide,proveOff:s.proveOff,units:s.units,opening:s.opening,closing:s.closing,weekly:s.weekly}))}
function sDirty(){if(!setupDirty){setupDirty=true;$("#setupBar").classList.remove("idle");$("#setupMsg").textContent="Unsaved changes for the "+curSite().name;renderPublish()}}
function sharedHas(k,t){return !!S.shared&&(S.shared[k]||[]).some(c=>normT(c.t)===normT(t))}
function renderSetup(){
  $("#setupBar").classList.toggle("idle",!setupDirty);
  if(!setupDirty||!SE){SE=setupDraft();buildSetup()}
  renderPublish();
}
function toggleBox(box,items,isOn,onChange){
  box.replaceChildren();
  for(const[k,lbl]of items){
    const id=box.id+"_"+k;const cb=el("input",{type:"checkbox",id,disabled:ro()});cb.checked=isOn(k);
    cb.addEventListener("change",()=>{onChange(k,cb.checked);sDirty()});
    box.append(el("label",{for:id},cb,lbl));
  }
}
function buildSetup(){
  const R=ro(),site=curSite(),s=SE;
  $("#setupTitle").textContent=`${site.name} details`;
  const fr=$("#setupFresh");fr.hidden=!S.settings.fresh;
  fr.textContent=`The ${site.name} hasn't been set up yet, so it's using the standard checks. Change them below and save, or publish another site's checks to it.`;
  const bind=(sel,key,def)=>{const n=$(sel);n.value=s.info[key]!=null?s.info[key]:(def||"");n.disabled=R;n.oninput=()=>{s.info[key]=n.value;sDirty()}};
  bind("#siAddr","address",site.addr);bind("#siManager","manager");bind("#siNote","note");
  toggleBox($("#siDays"),WEEKDAYS,k=>!s.closedDays.includes(k),(k,on)=>{s.closedDays=s.closedDays.filter(x=>x!==k);if(!on)s.closedDays.push(k)});
  toggleBox($("#siTabs"),OPT_TABS,k=>!s.hide[k],(k,on)=>{if(on)delete s.hide[k];else s.hide[k]=true});
  toggleBox($("#siProve"),Object.entries(PROVE).map(([k,r])=>[k,r.label]),k=>!s.proveOff.includes(k),(k,on)=>{s.proveOff=s.proveOff.filter(x=>x!==k);if(!on)s.proveOff.push(k)});
  const ub=$("#unitEdit");ub.replaceChildren();
  s.units.forEach((u,i)=>ub.append(unitRow(u,i)));
  if(!s.units.length)ub.append(el("div",{class:"by",text:"No fridges or freezers at this site. The temperature section is hidden from the daily diary."}));
  for(const[k]of LISTS){
    const box=$("#ce"+k[0].toUpperCase()+k.slice(1));box.replaceChildren();
    s[k].forEach((c,i)=>{
      const cb=el("input",{type:"checkbox",disabled:R,"aria-label":"Used at this site: "+(c.t||"new check"),title:"Used at this site"});cb.checked=!c.off;
      const tx=el("input",{type:"text",id:`ce_${k}_${i}`,value:c.t,disabled:R,placeholder:"Describe the check","aria-label":"Check"});
      const row=el("div",{class:"chk-row"+(c.off?" off":"")});
      cb.addEventListener("change",()=>{if(cb.checked)delete c.off;else c.off=true;row.classList.toggle("off",!cb.checked);sDirty()});
      tx.addEventListener("input",()=>{c.t=tx.value;sDirty()});
      const tag=el("span",{class:"tag",text:!S.shared?"":sharedHas(k,c.t)?"Shared":"This site only"});
      const del=el("button",{class:"btn ghost sm danger",disabled:R,"aria-label":"Delete check"},"✕");
      armDelete(del,"✕",()=>{s[k].splice(i,1);sDirty();buildSetup()});
      row.append(cb,tx,tag,del);box.append(row);
    });
    if(!s[k].length)box.append(el("div",{class:"by",text:"No checks."}));
  }
  for(const x of["#addUnit","#saveSetup","#discardSetup"])$(x).disabled=R;
  document.querySelectorAll("[data-addchk]").forEach(b=>b.disabled=R);
}
function unitRow(u,i){
  const r=el("div",{class:"row"});
  const nm=el("input",{type:"text",value:u.name,id:"un_"+i,"aria-label":"Unit name",style:"flex:1 1 180px;width:auto",disabled:ro()});
  nm.addEventListener("input",()=>{u.name=nm.value;sDirty()});
  const s=el("select",{id:"uk_"+i,"aria-label":"Type",style:"width:auto",disabled:ro()},el("option",{value:"fridge"},"Fridge / chiller"),el("option",{value:"freezer"},"Freezer"));s.value=u.kind;
  s.addEventListener("change",()=>{u.kind=s.value;sDirty()});
  r.append(nm,s,el("button",{class:"btn ghost",disabled:ro(),onclick:()=>{SE.units.splice(i,1);sDirty();buildSetup()}},"Remove"));
  return r;
}
const cleanList=l=>l.map(c=>({id:c.id,t:String(c.t||"").trim(),...(c.off?{off:true}:{})})).filter(c=>c.t);
function storable(s){const o={...s};delete o.fresh;return o}
async function saveSetup(){
  if(ro()||!SE)return;
  const site=S.site,s=SE;
  const next={...storable(S.settings),info:{...s.info},closedDays:[...s.closedDays],hide:{...s.hide},proveOff:[...s.proveOff],
    units:s.units.map(u=>({id:u.id,name:String(u.name||"").trim()||"Unnamed unit",kind:u.kind})),
    opening:cleanList(s.opening),closing:cleanList(s.closing),weekly:cleanList(s.weekly),updatedBy:S.me,updatedAt:Date.now()};
  if(!next.startDate)next.startDate=today();
  if(next.closedDays.length===7){$("#setupMsg").textContent="Leave at least one day open.";return}
  if(await save(()=>D("settings","main",site).set(next))){setupDirty=false;SE=null;$("#setupMsg").textContent=`Setup saved for the ${siteOf(site).name}.`;renderSetup()}
}
$("#saveSetup").addEventListener("click",saveSetup);
$("#discardSetup").addEventListener("click",()=>{setupDirty=false;SE=null;$("#setupMsg").textContent="Changes discarded.";renderSetup()});
$("#addUnit").addEventListener("click",()=>{SE.units.push({id:"u"+Date.now().toString(36),name:"",kind:"fridge"});sDirty();buildSetup();const n=$("#un_"+(SE.units.length-1));if(n)n.focus()});
document.querySelectorAll("[data-addchk]").forEach(b=>b.addEventListener("click",()=>{
  const k=b.dataset.addchk;SE[k].push({id:k[0]+Date.now().toString(36),t:""});sDirty();buildSetup();
  const n=$(`#ce_${k}_${SE[k].length-1}`);if(n)n.focus();
}));

function mergeList(k,src,tgt){
  const out=[],used=new Set(),added=[],removed=[],kept=[],taken=new Set(tgt.map(x=>x.id));
  src.forEach((c,i)=>{
    const m=tgt.find(x=>!used.has(x.id)&&normT(x.t)===normT(c.t));
    if(m){used.add(m.id);out.push({id:m.id,t:c.t,...(m.off?{off:true}:{})})}
    else{let id=c.id;if(taken.has(id)||out.some(o=>o.id===id))id=k[0]+Date.now().toString(36)+i;out.push({id,t:c.t});added.push(c.t)}
  });
  for(const x of tgt)if(!used.has(x.id)){
    if(S.shared&&!sharedHas(k,x.t)){out.push(x);kept.push(x.t)}else removed.push(x.t);
  }
  return{list:out,added,removed,kept};
}
function pubTargets(){return $("#pubScope").value==="all"?SITES.filter(x=>x.id!==S.site).map(x=>x.id):[$("#pubSite").value].filter(id=>id&&id!==S.site)}
function planPublish(targetSettings){
  const src=S.settings;
  return SITES.filter(x=>targetSettings[x.id]).map(x=>{
    const tgt=targetSettings[x.id];const res={site:x.id,lists:{},added:0,removed:0,kept:0,detail:[]};
    for(const[k,lbl]of LISTS){
      const m=mergeList(k,src[k].map(c=>({id:c.id,t:c.t})),tgt[k]);
      res.lists[k]=m.list;res.added+=m.added.length;res.removed+=m.removed.length;res.kept+=m.kept.length;
      for(const t of m.added)res.detail.push(["Add",lbl,t]);for(const t of m.removed)res.detail.push(["Remove",lbl,t]);for(const t of m.kept)res.detail.push(["Keep (this site only)",lbl,t]);
    }
    const offN=LISTS.reduce((n,[k])=>n+res.lists[k].filter(c=>c.off).length,0);
    res.off=offN;res.fresh=!!tgt.fresh;
    return res;
  });
}
let pubArmed=false,pubNote="";
function renderPublish(){
  const R=ro(),site=curSite();
  const sel=$("#pubSite"),cur=sel.value;sel.replaceChildren(...SITES.filter(x=>x.id!==S.site).map(x=>el("option",{value:x.id},x.name)));
  if([...sel.options].some(o=>o.value===cur))sel.value=cur;
  $("#pubOneWrap").hidden=$("#pubScope").value!=="one";
  const ids=pubTargets();const tgts={};
  for(const id of ids)if(S.sum[id]&&S.sum[id].ready)tgts[id]=S.sum[id].settings;
  const plan=planPublish(tgts);
  const pv=$("#pubPreview");pv.replaceChildren();
  pv.append(el("div",{},el("strong",{text:`From: ${site.name}`}),el("span",{class:"by",text:` · ${LISTS.map(([k,l])=>`${S.settings[k].length} ${l.toLowerCase()}`).join(", ")} checks (including any turned off at the ${site.name})`})));
  pv.append(el("div",{class:"label",text:`Sites that will be updated (${ids.length})`}));
  if(!ids.length)pv.append(el("div",{class:"by",text:"Choose a site."}));
  for(const id of ids){
    const p=plan.find(x=>x.site===id);
    if(!p){pv.append(el("div",{class:"by",text:siteOf(id).name+": loading…"}));continue}
    const nochange=!p.added&&!p.removed&&!p.fresh;
    const head=el("div",{class:"row",style:"gap:8px"},el("strong",{text:siteOf(id).name}),
      nochange?el("span",{class:"pill ok",text:"Already matches"}):null,
      p.fresh?el("span",{class:"pill warn",text:"Not set up yet"}):null,
      p.added?el("span",{class:"pill",text:`${p.added} added`}):null,
      p.removed?el("span",{class:"pill bad",text:`${p.removed} removed`}):null,
      p.kept?el("span",{class:"pill",text:`${p.kept} kept (this site only)`}):null,
      p.off?el("span",{class:"pill",text:`${p.off} stay turned off`}):null);
    const det=p.detail.length?el("details",{},el("summary",{class:"by",style:"cursor:pointer",text:"Show changes"}),el("ul",{},...p.detail.map(([a,l,t])=>el("li",{text:`${a} · ${l}: ${t}`})))):null;
    pv.append(el("div",{style:"display:grid;gap:4px"},head,det));
  }
  pv.append(el("p",{class:"note",text:S.shared?"Checks a site added for itself (marked “This site only” in its setup) are kept. Other checks that aren't in the published list are removed.":"This is the first publish, so each chosen site's opening, closing and end-of-week checks will be replaced by this list. Checks a site has turned off stay off."}));
  const btn=$("#pubGo");pubArmed=false;
  const ready=ids.length&&ids.every(id=>plan.some(p=>p.site===id));
  btn.textContent=`Publish to ${ids.length===1?"the "+siteOf(ids[0]).name:ids.length+" sites"}`;
  btn.disabled=R||!ready||setupDirty;
  $("#pubMsg").textContent=setupDirty?`Save the ${site.name}'s setup first, then publish.`:pubNote;
  $("#pubPanel").hidden=!S.db;
  const sh=S.shared;
  $("#pubLast").textContent=sh&&sh.at?`Last published from the ${siteOf(sh.from).name} to ${(sh.to||[]).map(x=>siteOf(x).name).join(", ")} on ${when(sh.at)} by ${nameOf(sh.by)}.`:"Nothing published yet.";
  if(sh&&sh.by)resolveNames([sh.by]);
}
$("#pubScope").addEventListener("change",()=>{pubNote="";renderPublish()});
$("#pubSite").addEventListener("change",()=>{pubNote="";renderPublish()});
$("#pubGo").addEventListener("click",async()=>{
  const btn=$("#pubGo"),ids=pubTargets();
  if(!ids.length||ro()||setupDirty)return;
  const names=ids.map(id=>siteOf(id).name);
  if(!pubArmed){pubArmed=true;btn.textContent=`Tap again to update ${names.join(", ")}`;setTimeout(()=>{if(pubArmed)renderPublish()},4000);return}
  pubArmed=false;btn.disabled=true;pubNote="Publishing…";$("#pubMsg").textContent=pubNote;
  try{
    const tgts={};
    for(const id of ids){const snap=await D("settings","main",id).get();tgts[id]=normSettings(snap.exists?snap.data():null)}
    const plan=planPublish(tgts),now=Date.now();
    for(const p of plan){
      const next={...storable(tgts[p.site]),...p.lists,updatedBy:S.me,updatedAt:now,publishedAt:now,publishedFrom:S.site};
      if(!next.startDate)next.startDate=today();
      await D("settings","main",p.site).set(next);
    }
    const src=S.settings;
    await S.db.doc("config/shared").set({opening:src.opening.map(c=>({id:c.id,t:c.t})),closing:src.closing.map(c=>({id:c.id,t:c.t})),weekly:src.weekly.map(c=>({id:c.id,t:c.t})),from:S.site,to:ids,by:S.me,at:now});
    pubNote=`Published to ${names.join(", ")}.`;renderPublish();toast("Setup published");
  }catch(e){fail(e);pubNote="Publishing stopped part-way. Check each site's setup, then try again.";renderPublish()}
});

function renderAll(){renderSites();renderNav();renderHead();renderAttention();renderDay();renderWeek();renderHistory();renderTasks("extras");renderTasks("cleaning");renderProve();renderAllergenDocs();renderAllergens();renderPlansList();renderSuppliers();renderContacts();renderStaff();renderOnbList();renderInspList();renderReview();renderSetup()}

/* ---------- tabs ---------- */
const TABS=["day","week","history","extras","cleaning","prove","allergens","eho","plans","suppliers","contacts","staff","onboarding","review","setup","records","more"];
function show(tab,opts){
  if(!TABS.includes(tab))tab="day";
  if(!canTab(tab)){if(S.role==="staff"&&MANAGER_TABS.has(tab)&&!(opts&&opts.quiet))toast("That section is for managers.");tab="day"}
  const changed=S.tab!==tab;
  S.tab=tab;
  document.querySelectorAll("[data-panel]").forEach(p=>p.hidden=p.dataset.panel!==tab);
  $("#attention").hidden=tab!=="day"||!S.db;
  renderHead();renderNav();
  if(changed&&!(opts&&opts.keepScroll))window.scrollTo({top:0});
  try{localStorage.setItem("sfbb.tab",tab)}catch(e){}
}
// The large title, its subtitle and (on phones) a back link to Records or More.
function renderHead(){
  const t=S.tab,n=navOf(t);
  const title=t==="records"?"Records":t==="more"?"More":t==="day"?(S.date===today()?"Today":"Diary"):t==="week"?"This week":n?n.t:"";
  const sub=t==="day"?parse(S.date).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}):curSite().name;
  $("#pageTitle").textContent=title;$("#pageSub").textContent=sub;
  const back=n&&n.grp==="records"?["records","Records"]:n&&n.grp==="manage"?["more","More"]:null;
  const bb=$("#backBtn");bb.hidden=!back;
  if(back){bb.replaceChildren(svgi(ICON.chevL),el("span",{text:back[1]}));bb.onclick=()=>show(back[0])}
  document.title=(title?title+" · ":"")+"Kitchen Diary";
}
function applyTabs(){if(S.tab&&!canTab(S.tab))show("day",{quiet:true});else renderNav()}
window.addEventListener("hashchange",()=>{const h=location.hash.slice(1);if(TABS.includes(h))show(h)});
show((()=>{const h=location.hash.slice(1);if(TABS.includes(h))return h;try{const t=localStorage.getItem("sfbb.tab");return TABS.includes(t)?t:"day"}catch(e){return"day"}})(),{quiet:true});

/* ---------- site switching & subscriptions ---------- */
function switchSite(id){
  if(id===S.site)return;
  if((S.plan&&S.plan.dirty)||(S.insp&&S.insp.dirty)||(S.onb&&S.onb.dirty)||setupDirty){toast("Save or discard your changes before switching site.");return}
  if(plCtl||ehoCtl||obCtl||adBusy){toast("Wait for the upload to finish before switching site.");return}
  if(S.plan)closePlan();if(S.insp)closeInsp();if(S.onb)closeOnb();
  S.site=id;try{localStorage.setItem("sfbb.site",id)}catch(e){}
  Object.assign(S,{days:{},weeks:{},allergens:[],allergenDocs:[],reviews:[],extras:[],cleaning:[],suppliers:[],contacts:[],plans:[],onboarding:[],inspections:[],staff:[],prove:[],rev:{}});
  S.settings=S.sum[id]&&S.sum[id].ready?S.sum[id].settings:normSettings(null);S.cfg=activeCfg(S.settings);
  SE=null;setupDirty=false;pubNote="";$("#setupMsg").textContent="";
  editTask("extras",null);editTask("cleaning",null);editSupplier(null);editContact(null);editStaff(null);editAlg(null);
  setAdFile(null);setPlFile(null);setEhoFile(null);setObFile(null);
  for(const x of["#problems","#wkNotes","#revNotes","#adTitle","#adNote"])$(x).value="";
  editStaff(null);
  for(const x of["#adMsg","#pMsg","#algConfirm","#tMsg","#revMsg","#pubMsg"])$(x).textContent="";
  fillProve();applyTabs();renderAll();
  if(S.db)subscribeSite();
  window.scrollTo({top:0});
}
function subscribeSite(){
  for(const u of S.subs)try{u()}catch(e){}
  S.subs=[];
  const site=S.site,mine=()=>site===S.site;
  const err=e=>{if(e&&e.code==="revoked"){S.canWrite=false;renderAll()}};
  const sub=(q,fn)=>S.subs.push(q.onSnapshot(x=>{if(mine())fn(x)},err));
  const list=(col,key,after,q)=>sub(q||C(col,site),x=>{S[key]=x.docs.map(d=>({id:d.id,...d.data()}));after()});
  sub(D("settings","main",site),x=>{S.settings=normSettings(x.exists?x.data():null);S.cfg=activeCfg(S.settings);fillProve();applyTabs();renderAll()});
  sub(C("days",site).orderBy("date","desc").limit(400),q=>{const m={};for(const d of q.docs)m[d.id]=d.data();S.days=m;renderDay();renderHistory();renderReview()});
  sub(C("weeks",site).orderBy("week","desc").limit(120),q=>{const m={};for(const d of q.docs)m[d.id]=d.data();S.weeks=m;renderWeek()});
  list("allergens","allergens",renderAllergens);
  list("allergenDocs","allergenDocs",renderAllergenDocs);
  list("reviews","reviews",renderReview,C("reviews",site).orderBy("date","desc").limit(50));
  list("extras","extras",()=>{renderTasks("extras");renderReview()});
  list("cleaning","cleaning",()=>{renderTasks("cleaning");renderReview()});
  list("suppliers","suppliers",renderSuppliers);
  list("contacts","contacts",renderContacts);
  list("plans","plans",()=>{onPlansSnapshot();renderReview()});
  list("onboarding","onboarding",onOnbSnapshot);
  list("inspections","inspections",()=>{onInspSnapshot();renderReview()});
  list("staff","staff",()=>{renderStaff();renderReview()});
  list("proveit","prove",()=>{renderProve();renderReview()},C("proveit",site).orderBy("at","desc").limit(500));
}
function subscribeSummaries(){
  const err=()=>{};
  const upd=()=>{renderSites();renderNav();renderAttention();renderPublish()};
  for(const x of SITES){
    const sm=S.sum[x.id]={settings:normSettings(null),days:{},extras:[],cleaning:[],got:{}};
    const mark=k=>{sm.got[k]=true;sm.ready=["settings","days","extras","cleaning"].every(n=>sm.got[n]);upd()};
    D("settings","main",x.id).onSnapshot(s=>{sm.settings=normSettings(s.exists?s.data():null);mark("settings")},err);
    C("days",x.id).orderBy("date","desc").limit(14).onSnapshot(q=>{const m={};for(const d of q.docs)m[d.id]=d.data();sm.days=m;mark("days")},err);
    for(const k of["extras","cleaning"])C(k,x.id).onSnapshot(q=>{sm[k]=q.docs.map(d=>({id:d.id,...d.data()}));mark(k)},err);
  }
  S.db.doc("config/shared").onSnapshot(s=>{S.shared=s.exists?s.data():null;if(!setupDirty){SE=setupDraft();buildSetup()}renderPublish()},err);
}

/* ---------- events ---------- */
$("#dayDate").addEventListener("change",e=>{if(e.target.value){S.date=e.target.value;renderDay();renderHead()}});
$("#todayBtn").addEventListener("click",()=>{S.date=today();renderDay();renderHead()});
$("#saveProb").addEventListener("click",async()=>{await patchDay(S.date,{problems:{text:$("#problems").value.trim(),...stamp()}});toast("Note saved")});
$("#wkPrev").addEventListener("click",()=>{S.week=addDays(S.week,-7);renderWeek()});
$("#wkNext").addEventListener("click",()=>{S.week=addDays(S.week,7);renderWeek()});
$("#wkThis").addEventListener("click",()=>{S.week=monday(today());renderWeek()});
$("#wkSaveNote").addEventListener("click",async()=>{await patchWeek(S.week,{notes:{text:$("#wkNotes").value.trim(),...stamp()}});toast("Note saved")});
$("#algSave").addEventListener("click",async()=>{
  const name=$("#algName").value.trim();if(!name){$("#algConfirm").textContent="Give the item a name first.";return}
  const contains=[...document.querySelectorAll("#algChecks input:checked")].map(c=>c.value);
  const body={name,source:$("#algSupplier").value.trim(),contains,notes:$("#algNotes").value.trim(),by:S.me,at:Date.now()};
  const ok=S.editAlg?await save(()=>D("allergens",S.editAlg).set(body)):await save(()=>C("allergens").add(body));
  if(ok){$("#algConfirm").textContent=`Saved ${name}.`;editAlg(null)}
});
$("#algCancel").addEventListener("click",()=>editAlg(null));
armDelete($("#algDelete"),"Remove item",async()=>{if(await save(()=>D("allergens",S.editAlg).delete())){editAlg(null);toast("Item removed")}});
$("#revSave").addEventListener("click",async()=>{
  if(REVIEW_QS.some(([k])=>!(S.rev[k]&&S.rev[k].a))){$("#revMsg").textContent="Answer every question before signing.";return}
  const date=today();
  if(await save(()=>D("reviews",date).set({date,answers:S.rev,notes:$("#revNotes").value.trim(),by:S.me,at:Date.now()}))){S.rev={};$("#revNotes").value="";$("#revMsg").textContent="Review signed and saved."}
});
/* ---------- boot ---------- */
buildAlgChecks();buildTaskForm("extras");buildTaskForm("cleaning");proveForm();supForm();conForm();staffForm();editStaff(null);
applyTabs();renderAll();
(async()=>{
  const[db,user,sample,assets]=await Promise.all([window.claude?.use?.("db"),window.claude?.use?.("user"),window.claude?.use?.("sample"),window.claude?.use?.("assets")]);
  S.db=db||null;S.user=user||null;S.sample=sample||null;S.assets=assets||null;
  if(!S.db){$("#offline").hidden=false;S.canWrite=false;renderAll();return}
  if(S.user){
    const me=await S.user.me();S.me=me.id;
    const w=await S.user.can("data.write");if(w===false){S.canWrite=false;$("#readonly").hidden=false}
    S.myName=me.name||"";S.role=me.role||"staff";renderMe();
    if(!canTab(S.tab))show("day");else renderNav();
  }
  subscribeSummaries();
  subscribeSite();
  renderAll();
})();

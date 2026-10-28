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
const ALL_TOPICS=[["hygiene","Personal hygiene & handwashing"],["cross","Cross-contamination"],["cleaning","Cleaning"],["chilling","Chilling"],["cooking","Cooking & reheating"],["allergens","Allergens"],["diary","Opening & closing checks"],["l2","Level 2 Food Hygiene certificate"]];
const TOPICS=ALL_TOPICS;
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
// A task's "last done" date entered by hand has no real time of day, so it shows as a date only.
const lastWhen=(ts,set)=>!ts?"":set?new Date(ts).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:new Date(ts).getFullYear()===new Date().getFullYear()?undefined:"numeric"}):when(ts);
// A short message above the tab bar. With an action (e.g. ["Undo", fn]) it stays longer and shows a button.
function toast(m,action){
  const t=$("#toast");t.hidden=true;void t.offsetWidth;
  t.replaceChildren(el("span",{text:m}),action?el("button",{type:"button",onclick:()=>{t.hidden=true;action[1]()}},action[0]):"");
  t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,action?5000:2400);
}

const S={site:(()=>{try{const s=localStorage.getItem("sfbb.site");return SITES.some(x=>x.id===s)?s:"roastery"}catch(e){return"roastery"}})(),
  cfg:null,sum:{},subs:[],allergenDocs:[],assets:null,shared:null,
  db:null,user:null,me:null,canWrite:true,settings:DEFAULT_SETTINGS,days:{},weeks:{},allergens:[],reviews:[],extras:[],cleaning:[],suppliers:[],contacts:[],plans:[],plan:null,onboarding:[],onb:null,inspections:[],insp:null,staff:[],prove:[],
  date:today(),week:monday(today()),editAlg:null,editStaff:null,names:{},rev:{}};
S.role="";S.myName="";
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
  s.trainingOff=Array.isArray(s.trainingOff)?s.trainingOff:[];
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
  if(!base)return days>0?{cls:"bad",text:"Never done",overdue:true}:{cls:"warn",text:"Not done yet",overdue:false};
  if(!days)return t.lastAt?{cls:"ok",text:"Last done "+lastWhen(t.lastAt,t.lastSet),overdue:false}:{cls:"warn",text:"Not done yet",overdue:false};
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
  let ps;try{ps=await S.user.profiles(ids)}catch(e){return}
  if(!ps)return; // offline: keep the names already shown
  let changed=false;
  for(const id of ids){const n=(ps[id]&&ps[id].name)||"";if(S.names[id]!==n){S.names[id]=n;changed=true}}
  if(changed)renderAll();
}
const nameOf=id=>id===S.me?"you":(S.names[id]||(String(id||"").startsWith("web:")?String(id).slice(4):"a team member"));

/* ---------- checklist helper ---------- */
function checklist(box,checks,items,prefix,onToggle){
  box.replaceChildren();const ctx=S.site+S.date+S.week;
  for(const c of checks){
    const id=`${prefix}_${c.id}`;
    const cb=el("input",{type:"checkbox",id,disabled:ro()});cb.checked=!!items[c.id];
    if(cb.checked&&box._ctx===ctx&&box._prev[c.id]===false)cb.classList.add("pop"); // just ticked, here or on another device
    cb.addEventListener("change",()=>onToggle(c.id,cb.checked));
    box.append(el("li",{},el("label",{for:id},cb,el("span",{text:c.t}))));
  }
  if(!checks.length)box.append(el("li",{class:"empty",text:"No checks set up. Add them in Setup."}));
  box._prev=Object.fromEntries(checks.map(c=>[c.id,!!items[c.id]]));box._ctx=ctx;
}

/* ---------- list rows and add / edit forms ---------- */
// A list row that opens in place to show more: details, history and actions.
const xOpen={};
function xrow(key,{lead,title,sub,right,details,cls}){
  const open=!!xOpen[key]&&!!details;
  const more=details?el("div",{class:"xmore",hidden:!open},...details):null;
  const main=el("button",{class:"xmain",type:"button","aria-expanded":details?String(open):null,disabled:!details,onclick:()=>{
    xOpen[key]=!xOpen[key];more.hidden=!xOpen[key];more.classList.add("anim");main.setAttribute("aria-expanded",String(xOpen[key]));row.classList.toggle("open",xOpen[key])}},
    lead||null,el("span",{class:"t"},el("b",{text:title}),sub?el("span",{class:"s",text:sub}):null));
  const row=el("div",{class:"xrow"+(open?" open":"")+(cls?" "+cls:"")},el("div",{class:"xhead"},main,...(right||[]).filter(Boolean)),more);
  return row;
}
const xfacts=pairs=>el("dl",{class:"facts"},...pairs.filter(p=>p[1]).flatMap(([k,v])=>[el("dt",{text:k}),el("dd",{},v)]));
const telLink=n=>el("a",{href:"tel:"+String(n).replace(/[^\d+]/g,""),class:"mono"},n);
const callBtn=(n,label)=>n?el("a",{class:"call",href:"tel:"+String(n).replace(/[^\d+]/g,""),"aria-label":label||"Call "+n,title:"Call "+n},svgi(ICON.contacts)):null;

// List sections keep their form closed until someone taps Add (in the page heading) or Edit on an item.
const FORMS={
  extras:{panel:"#xFormPanel",add:"Add check",reset:()=>editTask("extras",null)},
  cleaning:{panel:"#kFormPanel",add:"Add job",reset:()=>editTask("cleaning",null)},
  allergens:{panel:"#algFormPanel",add:"Add item",reset:()=>editAlg(null)},
  suppliers:{panel:"#sFormPanel",add:"Add supplier",reset:()=>editSupplier(null)},
  contacts:{panel:"#cFormPanel",add:"Add contact",reset:()=>editContact(null)},
  staff:{panel:"#tFormPanel",add:"Add person",reset:()=>editStaff(null)}};
const formOpen={};
function setForm(tab,open){
  const f=FORMS[tab],p=$(f.panel);formOpen[tab]=!!open;p.hidden=ro()||!open;
  if(!p._x){p._x=el("button",{class:"closex",type:"button","aria-label":"Close",onclick:()=>{f.reset();setForm(tab,false)}},"Cancel");p.prepend(p._x)}
  if(open&&!p.hidden){p.scrollIntoView({behavior:"smooth",block:"start"});const i=p.querySelector("input[type=text],input:not([type])");if(i)i.focus({preventScroll:true})}
  renderAddBtn();
}
// Things the Add button can start in sections without an add form: one action, or a short menu.
const ADD_ACTIONS={
  plans:()=>S.plan?null:["Add",[["New HACCP plan","plans",()=>newPlan("haccp")],["New risk assessment","review",()=>newPlan("risk")]]],
  onboarding:()=>S.onb?null:["Add",[["New induction checklist","onboarding",()=>newOnb(true)],["New blank document","doc",()=>newOnb(false)]]],
  eho:()=>S.insp||!inspSorted().length?null:["Add",[["Add inspection","eho",manualInsp]]]};
function renderAddBtn(){
  const b=$("#addBtn");if(!b)return;
  const f=FORMS[S.tab],a=ADD_ACTIONS[S.tab]&&ADD_ACTIONS[S.tab]();
  b.hidden=ro()||(f?!!formOpen[S.tab]:!a);if(b.hidden)return;
  b.replaceChildren(svgi(ICON.plus),el("span",{text:f?f.add:a[0]}));
  b.onclick=f?()=>{f.reset();setForm(S.tab,true)}:a[1].length===1?a[1][0][2]:()=>openMenu(b,a[1]);
}
// A small menu under a button: items are [label, icon, action].
function openMenu(anchor,items){
  const m=$("#acctMenu");
  m.replaceChildren(...items.map(([t,ic,fn])=>el("button",{class:"m",type:"button",role:"menuitem",onclick:()=>{closeSheets();fn()}},svgi(ICON[ic]),el("span",{text:t}))));
  const r=anchor.getBoundingClientRect();
  m.style.bottom="";m.style.top=(r.bottom+8)+"px";m.style.left=Math.max(12,Math.min(r.right-260,innerWidth-272))+"px";
  $("#sheetVeil").hidden=false;m.hidden=false;m.querySelector("button").focus();
}

/* ---------- section cards (Today and Week) ---------- */
// Each card has a header that opens and closes it. Unless someone has opened or closed it, a card is
// open while it still has something to do and closes once it's done.
const secOpen={};
function ringEl(n,t){
  const r=15,c=2*Math.PI*r,f=t?Math.min(1,n/t):0;
  const w=el("span",{class:"ring","aria-hidden":"true"});
  w.innerHTML=`<svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="${r}" fill="none" stroke="var(--sunk)" stroke-width="3.5"/><circle cx="17" cy="17" r="${r}" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${c*f} ${c}"${f?"":` stroke-opacity="0"`}/></svg>`;
  w.append(el("span",{text:String(n)}));return w;
}
const badgeEl=(state,ic)=>{const b=el("span",{class:"badge "+(state||""),"aria-hidden":"true"});b.append(svgi(ICON[ic||(state==="done"?"check":state==="bad"?"warn":"dot")]||""));return b};
function secCard(card,key,done,mark,title,sub){
  const k=key+":"+(key==="weekly"||key==="wknotes"?S.week:S.date);
  const open=k in secOpen?secOpen[k]:!done;
  // Pop the badge only when this card has just become done (not when moving between days or sites).
  const ctx=S.site+k;
  if(card._ctx===ctx&&done&&card._done===false&&mark.classList)mark.classList.add("pop");
  card._ctx=ctx;card._done=done;
  const h=card.querySelector(".sec");
  h.replaceChildren(mark,el("span",{class:"t"},el("b",{text:title}),el("span",{class:"s",text:sub||""})),el("span",{class:"chev"},svgi(ICON.chevD)));
  h.setAttribute("aria-expanded",String(open));card.classList.toggle("shut",!open);
  h.onclick=()=>{secOpen[k]=!open;key==="weekly"||key==="wknotes"?renderWeek():renderDay()};
}
function openSec(card,key){secOpen[key+":"+(key==="weekly"||key==="wknotes"?S.week:S.date)]=true}
// Ticks for a list of checks, with "Tick all" (recorded as allDone, the "All checks completed" confirmation).
function checkFoot(foot,list,items,part,onAll){
  foot.replaceChildren();
  const left=list.filter(c=>!items[c.id]).length;
  if(!list.length){foot.append(el("span",{class:"s",text:"No checks set up. Add them in Setup."}));return}
  const who=part&&part.allDone?`Confirmed by ${nameOf(part.allDone.by)} at ${time(part.allDone.at)}`:part&&part.at?`Last ticked ${time(part.at)} by ${nameOf(part.by)}`:"";
  foot.append(el("span",{class:"s",text:left?`${left} left${who?" · "+who:""}`:who||"All ticked"}));
  if(left&&!ro())foot.append(el("button",{class:"btn ghost sm",type:"button",onclick:onAll},svgi(ICON.check),`Tick all ${left===list.length?list.length:""}`.trim()));
}
function roundChecks(box){box.querySelectorAll("input[type=checkbox]").forEach(x=>x.classList.add("rc"))}
const firstName=n=>String(n||"").trim().split(/\s+/)[0]||"you";
function setFab(btn,show,label,onclick){
  btn.hidden=!show;if(!show)return;
  btn.replaceChildren(el("span",{class:"avatar",text:initials(S.myName)}),el("span",{text:label}));btn.onclick=onclick;
}
function updFab(){document.body.classList.toggle("hasfab",[...document.querySelectorAll(".fab")].some(b=>!b.hidden&&!b.closest("[hidden]")))}

/* ---------- today ---------- */
function renderDay(){
  const ae=document.activeElement,keep=ae&&ae.id&&ae.closest&&ae.closest("#units")?{id:ae.id,v:ae.value}:null;
  try{renderDayInner()}finally{if(keep){const n=document.getElementById(keep.id);if(n){n.value=keep.v;n.focus()}}}
  updFab();
}
const stepsOf=(st,temps)=>[["Temps",temps?st.temps==="y":true],["Opening",st.open==="y"],["Closing",st.close==="y"],["Sign off",!!st.signed]];
function renderDayInner(){
  const d=S.days[S.date]||{},s=S.cfg,st=dayStatus(d),R=ro(),isToday=S.date===today();
  $("#dayDate").value=S.date;$("#dayDate").max=today();$("#dayNext").disabled=S.date>=today();
  $("#todayBtn").hidden=isToday;
  const ids=[];
  // progress
  const steps=stepsOf(st,s.units.length),nDone=steps.filter(x=>x[1]).length,next=steps.find(x=>!x[1]);
  $("#daySteps").replaceChildren(
    el("div",{class:"head"},el("b",{text:d.signed?"Day signed off":nDone?`${nDone} of 4 done`:"Start with "+steps[0][0].toLowerCase().replace("temps","temperatures")}),
      el("span",{class:"pill "+(d.signed?"ok":next&&next[0]==="Sign off"?"ok":"acc"),text:d.signed?"Complete":next?(next[0]==="Sign off"?"Ready to sign off":next[0]+" next"):""})),
    el("div",{class:"steprow"},...steps.map(([t,ok])=>el("button",{type:"button",class:"step"+(ok?" on":next&&next[0]===t?" now":""),"aria-label":`${t}: ${ok?"done":"to do"}. Go to it`,onclick:()=>goStep(t)},el("i"),el("span",{text:t})))));
  // anything overdue at this site (today only)
  const al=$("#dayAlerts");al.replaceChildren();
  const a=isToday&&S.db?siteAttention(S.site):null;
  if(a&&a.unused){
    al.append(alertEl("Not in use yet",`Nothing is counted as missing at the ${curSite().name} until it starts.`,canTab("setup")?["Set up",()=>show("setup")]:null,""));
  }else if(a){
    if(a.prevDue){const ps=a.pst,gaps=[];if(ps.open!=="y")gaps.push("opening");if(ps.tN<ps.tTot)gaps.push("temps");if(ps.close!=="y")gaps.push("closing");
      al.append(alertEl(`${nice(a.prev)} wasn't signed off`,gaps.length?"Still to do: "+gaps.join(", "):"Everything was ticked; it just needs signing",["Open",()=>goDay(a.prev)]))}
    for(const{kind,t,ts}of a.tasks)
      al.append(alertEl(t.name,`${kind==="cleaning"?"Cleaning":"Extra check"} · ${(t.freq||"").replace(/^./,c=>c.toUpperCase())} · ${ts.text.toLowerCase()}`,R?null:["Done",()=>completeTask(kind,t,a.id,"")]));
  }
  const cn=$("#closedNote");cn.hidden=!isClosed(S.date);cn.textContent=`${curSite().name} is set as closed on ${parse(S.date).toLocaleDateString("en-GB",{weekday:"long"})}s. You can still record checks if it opened.`;
  const info=S.settings.info||{};
  $("#siteNotePanel").hidden=!info.note;$("#siteNoteTitle").textContent=`${curSite().name} notes`;
  $("#siteNote").replaceChildren(renderBody(info.note||""));
  // temperatures
  const tc=$("#tempsCard");tc.hidden=!s.units.length&&!S.settings.fresh;
  const units=$("#units");units.replaceChildren();const bad=[],chips=[];let last=null;
  for(const u of s.units){
    const r=d.temps&&d.temps[u.id]&&d.temps[u.id].am;const v=r&&r.v!=null?r.v:"";if(r){ids.push(r.by);if(!last||r.at>last.at)last=r}
    const id=`t_${u.id}`,cls=tempState(u.kind,v===""?null:v);
    if(cls==="bad")bad.push([u,v]);
    if(v!=="")chips.push(el("span",{class:"chip "+cls,text:`${u.name} ${v}°`}));
    const inp=el("input",{type:"number",step:"0.1",inputmode:"decimal",id,value:v,placeholder:"°C",disabled:R,"aria-label":`${u.name} temperature °C`});
    const mark=el("span",{class:"st","aria-hidden":"true"});
    const row=el("div",{class:"tf "+cls},el("label",{class:"n",for:id,text:u.name}),el("span",{class:"lim",text:(u.kind==="freezer"?"−18°C or colder":"5°C or below")+(r?` · ${time(r.at)}, ${nameOf(r.by)}`:"")}),el("span",{class:"v"},inp,mark));
    const paint=()=>{const c=tempState(u.kind,inp.value===""?null:Number(inp.value));row.className="tf "+c;mark.replaceChildren(c==="ok"?svgi(ICON.check):c==="bad"||c==="warn"?svgi(ICON.warn):"")};
    paint();inp.addEventListener("input",paint);
    inp.addEventListener("change",()=>{
      const raw=inp.value.trim();const val=raw===""?null:Math.round(Number(raw)*10)/10;
      if(raw!==""&&!isFinite(val))return;
      patchDay(S.date,{temps:{[u.id]:{am:val==null?null:{v:val,...stamp()}}}});
    });
    units.append(row);
  }
  if(!s.units.length)units.append(el("div",{class:"empty",text:"No fridges or freezers set up yet. Add them in Setup."}));
  const adv=$("#tempAdvice");adv.replaceChildren();
  if(bad.length){
    const[u,v]=bad[0];
    adv.append(el("div",{class:"advice"},el("b",{text:bad.length>1?`${bad.length} readings out of range`:`${u.name} is out of range (${v}°C)`}),
      el("span",{text:`Move high-risk food to a unit that's in range, check the door seal and setting, then take the reading again in 30 minutes. If it's still ${u.kind==="freezer"?"above −15°C":"above 8°C"}, call the engineer and decide what to throw away.`}),
      R?null:el("button",{class:"btn ghost sm",type:"button",onclick:()=>{openSec($("#probCard"),"problems");renderDay();const pb=$("#problems");if(!pb.value)pb.value=`${u.name} read ${v}°C at ${time(Date.now())}. `;pb.focus();pb.scrollIntoView({block:"center",behavior:"smooth"})}},"Write down what you did")));
  }
  const tDone=st.tN>=st.tTot&&st.tTot>0;
  secCard(tc,"temps",tDone&&!bad.length,bad.length?badgeEl("bad"):tDone?badgeEl("done"):ringEl(st.tN,st.tTot),"Temperatures",
    bad.length?"Out of range: needs action":tDone?`All in range${last?` · ${time(last.at)}, ${nameOf(last.by)}`:""}`:st.tN?`${st.tN} of ${st.tTot} taken`:"Fridges 5°C or below · freezers −18°C or colder");
  const tch=$("#tempChips");tch.replaceChildren(...chips);tch.hidden=!tc.classList.contains("shut")||!chips.length;
  // opening and closing
  for(const[key,list,card,box,foot,title]of[["opening",s.opening,"#openCard","#openList","#openFoot","Opening checks"],["closing",s.closing,"#closeCard","#closeList","#closeFoot","Closing checks"]]){
    const part=d[key]||{};const items=part.items||{};
    checklist($(box),list,items,key,(cid,v)=>patchDay(S.date,{[key]:{items:{[cid]:v},...stamp(),...(v?{}:{allDone:null})}}));roundChecks($(box));
    if(part.by)ids.push(part.by);if(part.allDone&&part.allDone.by)ids.push(part.allDone.by);
    const n=list.filter(c=>items[c.id]).length,all=list.length>0&&n===list.length;
    checkFoot($(foot),list,items,part,()=>{const set={},back={},date=S.date;for(const c of list){set[c.id]=true;back[c.id]=!!items[c.id]}
      patchDay(date,{[key]:{items:set,...stamp(),allDone:stamp()}});toast(`All ${key} checks done`,["Undo",()=>patchDay(date,{[key]:{items:back,allDone:null}})])});
    secCard($(card),key,all,all?badgeEl("done"):ringEl(n,list.length),title,
      all?`${n} of ${n}${part.allDone||part.at?` · ${nameOf((part.allDone||part).by)}, ${time((part.allDone||part).at)}`:""}`:n?`${n} of ${list.length} ticked`:key==="closing"?`After close · ${list.length} checks`:`${list.length} checks`);
  }
  // problems
  const pb=$("#problems"),pt=(d.problems&&d.problems.text)||"";if(document.activeElement!==pb)pb.value=pt;
  pb.disabled=R;$("#saveProb").disabled=R;
  if(d.problems&&d.problems.by)ids.push(d.problems.by);
  $("#probBy").textContent=d.problems&&d.problems.at?`Saved ${time(d.problems.at)} by ${nameOf(d.problems.by)}`:"";
  secCard($("#probCard"),"problems",true,badgeEl("acc","pen"),"Problems & changes",pt?pt.split("\n")[0]:bad.length?"Note what you did about the reading":"Optional · nothing noted");
  // sign off
  const sc=$("#signCard");sc.replaceChildren();
  const missing=steps.slice(0,3).filter(x=>!x[1]).map(x=>x[0].toLowerCase().replace("temps","temperatures")+(x[0]==="Temps"?"":" checks"));
  const sign=()=>{patchDay(S.date,{signed:{...stamp(),name:S.myName}});toast(`Day signed off by ${S.myName||"you"}`)}; // also replaces any Undo still showing
  if(d.signed){
    ids.push(d.signed.by);
    const who=d.signed.name||nameOf(d.signed.by),on=d.signed.at&&iso(new Date(d.signed.at))!==S.date?" on "+short(iso(new Date(d.signed.at))):"";
    sc.className="scard glass signcard done";
    sc.append(el("span",{class:"big"},svgi(ICON.check)),el("h2",{text:"Day signed off"}),el("span",{class:"s",text:`By ${who} at ${time(d.signed.at)}${on}`}),
      R?null:el("button",{class:"btn ghost sm",type:"button",onclick:()=>patchDay(S.date,{signed:null})},"Undo sign-off"));
  }else{
    sc.className="scard glass signcard";
    sc.append(el("div",{class:"sec"},badgeEl(missing.length?"":"acc",missing.length?"lock":"pen"),el("span",{class:"t"},el("b",{text:"Sign off"}),
      el("span",{class:"s",text:missing.length?"Still to do: "+missing.join(", "):`Confirms the day's checks were done. Signs as ${S.myName||"you"}.`}))));
    if(missing.length&&!R)sc.append(el("div",{class:"secfoot"},el("span",{class:"s",text:"Couldn't do everything? Say why under Problems, then sign off."}),
      el("button",{class:"btn ghost sm",type:"button",onclick:()=>{
        if(!pt.trim()){openSec($("#probCard"),"problems");renderDay();$("#problems").focus();toast("Write what was missed under Problems first.");return}
        sign();
      }},"Sign off anyway")));
  }
  setFab($("#signFab"),!d.signed&&!missing.length&&!R,`Sign off as ${firstName(S.myName)}`,sign);
  resolveNames(ids);
}
// From the progress bar: open that part of the day and bring it into view.
function goStep(t){
  const[card,key]={Temps:["#tempsCard","temps"],Opening:["#openCard","opening"],Closing:["#closeCard","closing"]}[t]||["#signCard",null];
  if(key)openSec($(card),key);renderDay();
  const n=$(card);n.scrollIntoView({behavior:"smooth",block:"start"});
  const i=n.querySelector("input:not(:checked):not([disabled])");if(i&&key==="temps")i.focus({preventScroll:true});
}
function alertEl(title,sub,action,cls){
  return el("div",{class:"alert "+(cls==null?"":cls)},el("span",{class:"ic"},svgi(ICON.warn)),el("span",{class:"t"},el("b",{text:title}),el("span",{class:"s",text:sub})),
    action?el("button",{class:"btn sm",type:"button",onclick:action[1]},action[0]):null);
}

/* ---------- week ---------- */
function renderWeek(){
  const wk=S.week,w=S.weeks[wk]||{},list=S.cfg.weekly||[],items=w.items||{},R=ro();
  $("#wkNext").disabled=wk>=monday(today());
  // the seven days, each with how complete it was
  const strip=$("#weekDays");strip.replaceChildren();
  for(let i=0;i<7;i++){
    const date=addDays(wk,i),dd=S.days[date],st=dayStatus(dd),t=today();
    const cls=date===t?"today":date>t?"future":dd&&dd.signed&&st.complete?"ok":st.any?"part":isClosed(date)?"closed":"bad";
    const lbl=parse(date).toLocaleDateString("en-GB",{weekday:"short"});
    strip.append(el("button",{class:"wday "+cls,type:"button",disabled:date>t,"aria-label":`${nice(date)}: ${cls==="ok"?"signed off":cls==="part"?"partly done":cls==="bad"?"nothing recorded":cls==="closed"?"closed":""}`,onclick:()=>goDay(date)},
      el("span",{text:lbl.slice(0,1)}),el("b",{text:String(parse(date).getDate())}),el("span",{class:"d"})));
  }
  const n=list.filter(c=>items[c.id]).length,all=list.length>0&&n===list.length;
  checklist($("#wkList"),list,items,"wk",(cid,v)=>patchWeek(wk,{items:{[cid]:v},...stamp()}));roundChecks($("#wkList"));
  checkFoot($("#wkFoot"),list,items,w,()=>{const set={},back={};for(const c of list){set[c.id]=true;back[c.id]=!!items[c.id]}
    patchWeek(wk,{items:set,...stamp()});toast("All end-of-week checks done",["Undo",()=>patchWeek(wk,{items:back})])});
  secCard($("#wkCard"),"weekly",all,all?badgeEl("done"):ringEl(n,list.length),"End-of-week checks",
    all?`${n} of ${n}${w.at?` · ${nameOf(w.by)}, ${when(w.at)}`:""}`:n?`${n} of ${list.length} ticked`:"Do these after the last shift of the week");
  const nt=$("#wkNotes"),ntx=(w.notes&&w.notes.text)||"";if(document.activeElement!==nt)nt.value=ntx;
  nt.disabled=R;$("#wkSaveNote").disabled=R;
  $("#wkNoteBy").textContent=w.notes&&w.notes.at?`Saved ${when(w.notes.at)} by ${nameOf(w.notes.by)}`:"";
  secCard($("#wkNoteCard"),"wknotes",true,badgeEl("acc","pen"),"Notes for the week",ntx?ntx.split("\n")[0]+(w.notes.by?` · ${nameOf(w.notes.by)}`:""):"Optional · pests, maintenance, anything to follow up");
  const sc=$("#wkSignCard");sc.replaceChildren();
  const sign=()=>{patchWeek(wk,{signed:{...stamp(),name:S.myName}});toast(`Week signed off by ${S.myName||"you"}`)};
  if(w.signed){
    sc.className="scard glass signcard done";
    sc.append(el("span",{class:"big"},svgi(ICON.check)),el("h2",{text:"Week signed off"}),el("span",{class:"s",text:`By ${w.signed.name||nameOf(w.signed.by)} on ${when(w.signed.at)}`}),
      R?null:el("button",{class:"btn ghost sm",type:"button",onclick:()=>patchWeek(wk,{signed:null})},"Undo sign-off"));
  }else{
    sc.className="scard glass signcard";
    sc.append(el("div",{class:"sec"},badgeEl(all?"acc":"",all?"pen":"lock"),el("span",{class:"t"},el("b",{text:"Sign off the week"}),
      el("span",{class:"s",text:all?`Signs as ${S.myName||"you"}.`:`Unlocks when the ${list.length-n===1?"last check is":`${list.length-n} checks are`} done`}))));
  }
  setFab($("#wkSignFab"),!w.signed&&all&&!R,`Sign off week as ${firstName(S.myName)}`,sign);
  updFab();
  resolveNames([w.by,w.signed&&w.signed.by,w.notes&&w.notes.by]);
}

/* ---------- history ---------- */
function renderHistory(){
  const grid=$("#strip");grid.replaceChildren();
  const end=today(),first=addDays(end,-27),start=monday(first);
  let complete=0,trading=0,missed=0,hot=0;const exc=[];
  for(const h of["M","T","W","T","F","S","S"])grid.append(el("span",{class:"h",text:h}));
  for(let date=start;date<=addDays(monday(end),6);date=addDays(date,1)){
    const dd=parse(date);
    if(date<first||date>end){grid.append(el("span",{class:"cd out",text:String(dd.getDate())}));continue}
    const d=S.days[date],st=dayStatus(d),shut=isClosed(date)&&!st.any;
    if(!shut){trading++;if(st.complete)complete++;else if(date<end&&!st.any)missed++}
    const cls=shut?"closed":st.complete||(d&&d.signed)?"ok":st.any?"part":date<end?"bad":"";
    grid.append(el("button",{class:"cd "+cls+(date===end?" today":"")+(st.issue?" hot":""),type:"button",title:nice(date),"aria-label":nice(date),onclick:()=>goDay(date)},String(dd.getDate())));
    if(d&&d.temps)for(const u of S.settings.units){const r=d.temps[u.id]&&d.temps[u.id].am;if(r&&tempState(u.kind,r.v)==="bad"){hot++;exc.push([date,`${u.name} read ${r.v}°C`,"bad"])}}
    if(date<end&&!st.complete&&!shut)exc.push([date,st.any?"Diary not completed":"No diary entry",st.any?"warn":"bad"]);
    if(d&&d.problems&&d.problems.text)exc.push([date,d.problems.text,""]);
  }
  const stat=(n,l,c)=>el("div",{class:"stat glass"},el("b",{class:c||"",text:n}),el("span",{text:l}));
  $("#histStats").replaceChildren(stat(`${complete}/${trading}`,"days complete",complete>=trading-2?"ok":"warn"),stat(String(missed),"days missed",missed?"bad":"ok"),stat(String(hot),"readings out of range",hot?"bad":"ok"));
  const box=$("#excList");box.replaceChildren();
  if(!exc.length)box.append(el("div",{class:"empty",text:"Nothing to report in the last 4 weeks."}));
  for(const[date,w,c]of exc.reverse())box.append(el("button",{class:"lrow",type:"button",onclick:()=>goDay(date)},
    el("span",{class:"sdot "+c}),el("span",{class:"t"},el("b",{text:w}),el("span",{class:"s",text:nice(date)})),el("span",{class:"chev"},svgi(ICON.chevR))));
}

/* ---------- task lists (extra checks & cleaning) ---------- */
const TASKS={
  extras:{list:"#xList",form:"#xForm",title:"#xFormTitle",panel:"#xFormPanel",noun:"extra check",
    fields:[["name","Check","text","e.g. Probe thermometer accuracy check"],["how","How to do it","text","e.g. Iced water and boiling water test; record in Prove it"],["freq","How often","freq"],["who","Who does it","text","e.g. Duty manager"]]},
  cleaning:{list:"#kList",form:"#kForm",title:"#kFormTitle",panel:"#kFormPanel",noun:"cleaning task",
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
    if(ok){msg.textContent="";toast(`Saved ${v.name}`);editTask(kind,null)}
  }},"Save");
  box.append(f,el("div",{class:"row"},saveBtn,cancel,del,msg));
  box._cancel=cancel;box._del=del;
}
function editTask(kind,t){
  const cfg=TASKS[kind];editing[kind]=t?t.id:null;
  $(cfg.title).textContent=t?"Edit "+t.name:"Add a "+cfg.noun;
  for(const[k,,type]of cfg.fields)$(`#${kind}_f_${k}`).value=t?(t[k]||(type==="freq"?"weekly":"")):(type==="freq"?"weekly":"");
  const box=$(cfg.form);box._cancel.hidden=true;box._del.hidden=!t;
  setForm(kind,!!t);
}
function renderTasks(kind){
  const cfg=TASKS[kind],box=$(cfg.list);box.replaceChildren();
  const R=ro(),ids=[];let over=0;
  const items=[...S[kind]].map(t=>({t,st:taskState(t),due:dueDate(t)}));
  if(!items.length)box.append(el("div",{class:"empty glass",text:`Nothing listed yet.${R?"":` Tap ${FORMS[kind].add} to add your first ${cfg.noun}.`}`}));
  const groups=[["Overdue",x=>x.st.overdue],["Due today",x=>!x.st.overdue&&x.st.cls==="warn"&&FREQ[x.t.freq]>0],["As needed",x=>!FREQ[x.t.freq]],["Coming up",()=>true]];
  const left=new Set(items);
  for(const[label,test]of groups){
    const g=[...left].filter(test);g.forEach(x=>left.delete(x));if(!g.length)continue;
    g.sort((a,b)=>(a.due||"9").localeCompare(b.due||"9")||a.t.name.localeCompare(b.t.name));
    if(label==="Overdue")over=g.length;
    const list=el("div",{class:"list glass"});
    for(const{t,st}of g){
      if(t.lastBy)ids.push(t.lastBy);
      const note=el("input",{type:"text",placeholder:"Note (optional)",disabled:R,"aria-label":"Note for "+t.name});
      const hist=(t.log||[]).slice(0,5).map(e=>el("li",{},el("span",{text:lastWhen(e.at,e.set)}),el("span",{class:"s",text:nameOf(e.by)+(e.note?" · "+e.note:"")})));
      const dateId=`${kind}_last_${t.id}`;
      const dateIn=el("input",{type:"date",id:dateId,max:iso(new Date()),value:t.lastAt?iso(new Date(t.lastAt)):""});
      for(const e of(t.log||[]).slice(0,5))ids.push(e.by);
      list.append(xrow(kind+t.id,{
        title:t.name,
        sub:[(t.freq||"").replace(/^./,c=>c.toUpperCase()),t.who,t.lastAt?`last ${lastWhen(t.lastAt,t.lastSet)}, ${nameOf(t.lastBy)}`:"never done"].filter(Boolean).join(" · "),
        right:[label==="Coming up"||label==="As needed"?el("span",{class:"pill "+(label==="As needed"?"":"ok"),text:label==="As needed"?"As needed":st.text.replace(/^Due /,"")}):el("span",{class:"pill "+st.cls,text:st.overdue?st.text.replace(/^Not done yet · /,"").replace(/^Overdue by (\d+) days?$/,"$1d late"):"Today"}),
          R?null:el("button",{class:"btn sm",type:"button",onclick:()=>completeTask(kind,t,S.site,"")},"Done")],
        details:[t.how?el("p",{class:"how",text:t.how}):null,
          R?null:el("div",{class:"row"},note,el("button",{class:"btn ghost sm",type:"button",onclick:()=>completeTask(kind,t,S.site,note.value.trim())},"Done with note")),
          R?null:el("div",{class:"row lastdate"},el("label",{class:"label",for:dateId,text:"Last done on"}),dateIn,
            el("button",{class:"btn ghost sm",type:"button",onclick:()=>setTaskDate(kind,t,S.site,dateIn.value)},"Save date")),
          hist.length?el("ul",{class:"hist"},...hist):el("p",{class:"s",text:"Not recorded as done yet."}),
          R?null:el("div",{class:"row"},el("button",{class:"btn ghost sm",type:"button",onclick:()=>editTask(kind,t)},"Edit "+cfg.noun))]}));
    }
    box.append(el("div",{class:"label"+(label==="Overdue"?" bad":""),text:`${label} · ${g.length}`}),list);
  }
  $(cfg.panel).hidden=R||!formOpen[kind];
  resolveNames(ids);
  return over;
}

async function completeTask(kind,t,site,note){
  const entry={at:Date.now(),by:S.me,note:note||""};
  const log=[entry,...(t.log||[])].slice(0,30);
  const before={lastAt:t.lastAt||null,lastBy:t.lastBy||null,lastSet:!!t.lastSet,log:t.log||[]};
  if(await save(()=>D(kind,t.id,site).update({lastAt:entry.at,lastBy:entry.by,lastSet:false,log})))
    toast(`${t.name}: done${site!==S.site?" at "+siteOf(site).name:""}`,["Undo",()=>save(()=>D(kind,t.id,site).update(before))]);
}

// Set the date a task was last carried out by hand, e.g. when it was done but not ticked off at the time.
// Stored at midday on that date (now, if it's today) and marked lastSet so it shows without a time.
async function setTaskDate(kind,t,site,value){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value||"");
  if(!m){toast("Choose a date first");return}
  const d=new Date(+m[1],+m[2]-1,+m[3],12);
  const today=iso(new Date())===value;
  if(!today&&d>new Date()){toast("That date is in the future");return}
  const at=today?Date.now():d.getTime();
  const entry={at,by:S.me,note:"Date entered by hand",set:true};
  const log=[entry,...(t.log||[])].slice(0,30);
  const before={lastAt:t.lastAt||null,lastBy:t.lastBy||null,lastSet:!!t.lastSet,log:t.log||[]};
  if(await save(()=>D(kind,t.id,site).update({lastAt:at,lastBy:S.me,lastSet:true,log})))
    toast(`${t.name}: last done ${lastWhen(at,true)}`,["Undo",()=>save(()=>D(kind,t.id,site).update(before))]);
}

/* ---------- prove it ---------- */
function fillProve(){
  const sel=$("#pMethod"),cur=sel.value;sel.replaceChildren();
  for(const[k,r]of Object.entries(PROVE))if(!S.settings.proveOff.includes(k))sel.append(el("option",{value:k},r.label));
  if(!sel.options.length)sel.append(el("option",{value:"other"},PROVE.other.label));
  if([...sel.options].some(o=>o.value===cur))sel.value=cur;
  const box=$("#pMethods");box.replaceChildren();
  for(const o of sel.options)box.append(el("button",{type:"button",role:"radio","aria-checked":String(o.value===sel.value),class:o.value===sel.value?"on":"",
    onclick:()=>{sel.value=o.value;fillProve()}},o.textContent));
  sel.dispatchEvent(new Event("change"));
}
// The pass/fail result, worked out as the reading is typed.
function proveLive(){
  const m=$("#pMethod").value,r=PROVE[m],box=$("#pResult");if(!r)return;
  const raw=$("#pReading").value.trim(),v=raw===""?null:Number(raw);
  const pass=proveResult(m,v,$("#pManual").value);
  box.hidden=pass==null||(r.manual&&raw===""&&!$("#pAction").value);
  if(box.hidden)return;
  box.className="result "+(pass?"ok":"bad");
  box.replaceChildren(el("span",{class:"badge "+(pass?"done":"bad")},svgi(ICON[pass?"check":"warn"])),
    el("span",{text:pass?"Pass":r.manual?"Fail: say what you did about it":`Fail: ${r.hint.replace(/^Pass /,"needs to be ").replace(/\..*$/,"")}. Say what you did about it.`}));
}
function proveForm(){
  const sel=$("#pMethod");
  $("#pDate").value=today();
  const upd=()=>{const r=PROVE[sel.value];if(!r)return;$("#pReadLbl").textContent=r.unit==="min"?"Minutes":`Reading (${r.unit||"°C"})`;$("#pHint").textContent=r.hint;$("#pManualWrap").hidden=!r.manual;proveLive()};
  sel.addEventListener("change",upd);fillProve();
  for(const x of["#pReading","#pManual"])$(x).addEventListener("input",proveLive);
  $("#pSave").addEventListener("click",async()=>{
    const m=sel.value,raw=$("#pReading").value.trim(),v=raw===""?null:Number(raw);
    const food=$("#pFood").value.trim();
    if(!food){$("#pMsg").textContent="Say what food or equipment you checked.";return}
    if(!PROVE[m].manual&&(v==null||!isFinite(v))){$("#pMsg").textContent="Enter the reading.";return}
    const pass=proveResult(m,v,$("#pManual").value);
    if(pass===false&&!$("#pAction").value.trim()){$("#pMsg").textContent="It failed: write what you did about it before saving.";$("#pAction").focus();return}
    const rec={date:$("#pDate").value||today(),method:m,food,reading:v,unit:PROVE[m].unit||"°C",pass,action:$("#pAction").value.trim(),by:S.me,at:Date.now()};
    if(await save(()=>C("proveit").add(rec))){
      $("#pMsg").textContent="";toast(pass?`Saved: ${food} passed`:`Saved: ${food} failed, action recorded`);
      $("#pFood").value="";$("#pReading").value="";$("#pAction").value="";proveLive();
    }
  });
}
function renderProve(){
  const box=$("#pList");box.replaceChildren();const ids=[];
  const recs=[...S.prove].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.at||0)-(a.at||0));
  const fails=recs.filter(r=>r.pass===false).length;
  const p=$("#pPill");p.textContent=`${recs.length} record${recs.length===1?"":"s"}${fails?` · ${fails} failed`:""}`;p.className="pill "+(fails?"warn":recs.length?"ok":"");
  if(!recs.length)box.append(el("div",{class:"empty",text:"No records yet. Start with a probe thermometer check and the core temperature of something you cook or reheat."}));
  for(const r of recs.slice(0,200)){
    ids.push(r.by);
    const rule=PROVE[r.method]||{label:r.method};
    let del=null;if(!ro()){del=el("button",{class:"btn ghost sm danger",type:"button"},"Remove record");armDelete(del,"Remove record",()=>save(()=>D("proveit",r.id).delete()))}
    box.append(xrow("p"+r.id,{
      title:r.food,sub:`${rule.label} · ${short(r.date)}`,
      right:[el("span",{class:"res",text:r.reading==null?"":`${r.reading}${r.unit==="min"?" min":"°"}`}),el("span",{class:"pill "+(r.pass?"ok":"bad"),text:r.pass?"Pass":"Fail"})],
      details:[xfacts([["Action",r.action],["Recorded by",nameOf(r.by)+(r.at?", "+when(r.at):"")],["Rule",rule.hint]]),del?el("div",{class:"row"},del):null]}));
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
    if(ok){msg.textContent="";toast(`Saved ${v.name}`);editSupplier(null)}
  }},"Save supplier");
  box.append(f,el("div",{class:"row"},saveBtn,cancel,del,msg));box._cancel=cancel;box._del=del;
}
function editSupplier(s){
  editSup=s?s.id:null;$("#sFormTitle").textContent=s?"Edit "+s.name:"Add a supplier";
  for(const[k]of SUP_FIELDS)$("#s_"+k).value=s?(s[k]||""):"";
  $("#sForm")._cancel.hidden=true;$("#sForm")._del.hidden=!s;
  setForm("suppliers",!!s);
}
function renderSuppliers(){
  const box=$("#sList");box.replaceChildren();
  const list=[...S.suppliers].sort((a,b)=>a.name.localeCompare(b.name));
  if(!list.length)box.append(el("div",{class:"empty",text:"No suppliers yet. Add your milk, coffee, bakery and any other food or drink suppliers."}));
  for(const s of list)box.append(xrow("s"+s.id,{
    lead:el("span",{class:"avatar sm",text:initials(s.name)}),title:s.name,sub:s.supplies||s.contact||"",
    right:[callBtn(s.phone,"Call "+s.name)],
    details:[xfacts([["Contact",s.contact],["Phone",s.phone?telLink(s.phone):""],["Email",s.email?el("a",{href:"mailto:"+s.email,text:s.email}):""],["Address",s.address],["Hygiene rating",s.rating],["Notes",s.notes]]),
      ro()?null:el("div",{class:"row"},el("button",{class:"btn ghost sm",type:"button",onclick:()=>editSupplier(s)},"Edit supplier"))]}));
  $("#sFormPanel").hidden=ro()||!formOpen.suppliers;
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

/* extraction */
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
  if(!list.length)box.append(el("div",{class:"empty",text:`No HACCP plans or risk assessments yet.${ro()?"":" Tap Add to start one from a template."}`}));
  for(const d of list){
    const rows=d[rowsKey(d.type)]||[];ids.push(d.updatedBy);
    const summary=d.type==="haccp"
      ?`${rows.length} step${rows.length===1?"":"s"} · ${rows.filter(r=>r.ccp).length} CCP${rows.filter(r=>r.ccp).length===1?"":"s"}`
      :`${rows.length} hazard${rows.length===1?"":"s"} · ${rows.filter(r=>riskOf(r).cls==="bad").length} high risk`;
    const rs=reviewState(d);
    box.append(el("button",{class:"lrow",type:"button",onclick:()=>openPlan(d.id)},el("span",{class:"tile "+(d.type==="haccp"?"purple":"orange")},svgi(ICON.plans)),
      el("span",{class:"t"},el("b",{text:d.title||PL_NAME[d.type]}),el("span",{class:"s",text:`${PL_NAME[d.type]} · ${summary} · updated ${when(d.updatedAt)}, ${nameOf(d.updatedBy)}`})),
      el("span",{class:"pill "+rs.cls,text:rs.text}),el("span",{class:"chev"},svgi(ICON.chevR))));
  }
  renderAddBtn();resolveNames(ids);
}
function openPlan(id,data){
  const p=data||S.plans.find(x=>x.id===id);if(!p)return;
  S.plan={id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false};
  $("#planListView").hidden=true;$("#planEditView").hidden=false;
  renderEditor();window.scrollTo({top:0});renderAddBtn();
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
    :"Risk = likelihood × severity, each from 1 (lowest) to 5 (highest).";
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
window.addEventListener("beforeunload",e=>{if(S.plan&&S.plan.dirty){e.preventDefault();e.returnValue=""}});

/* ---------- EHO inspections ---------- */
const EHO_AREAS=["Hygienic food handling","Cleanliness and structure","Management of food safety","Allergens","Other"];
const EHO_PRI=[["must","Must do","bad"],["should","Should do","warn"],["advice","Advice","ok"]];
const priOf=k=>EHO_PRI.find(p=>p[0]===k)||EHO_PRI[1];
const ratingCls=r=>r==null||r===""?"":r>=4?"ok":r===3?"warn":"bad";
const longDate=s=>s?parse(s).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):"";
const newIssueId=()=>"i"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const inspSorted=()=>[...S.inspections].sort((a,b)=>(b.inspectionDate||"").localeCompare(a.inspectionDate||"")||(b.createdAt||0)-(a.createdAt||0));
function deadlineState(i){
  if(i.done||!i.deadline)return null;
  const left=Math.round((parse(i.deadline)-parse(today()))/864e5);
  if(left<0)return{cls:"bad",text:"Overdue since "+short(i.deadline)};
  if(left<=7)return{cls:"warn",text:"Due "+short(i.deadline)};
  return{cls:"",text:"Due "+short(i.deadline)};
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
    box.append(el("section",{class:"panel"},el("div",{class:"empty",text:`No inspection recorded for the ${curSite().name} yet. Enter the last inspection below: the date, rating, scores and anything the inspector asked you to fix.`})));
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
  $("#ehoUploadPanel").hidden=R||!!latest;
  renderAddBtn();
}
function openInsp(id,data){
  const p=data||S.inspections.find(x=>x.id===id);if(!p)return;
  S.insp={id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false};
  $("#ehoListView").hidden=true;$("#ehoEditView").hidden=false;renderInspEditor();window.scrollTo({top:0});renderAddBtn();
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
$("#ehoManual").addEventListener("click",manualInsp);
window.addEventListener("beforeunload",e=>{if(S.insp&&S.insp.dirty){e.preventDefault();e.returnValue=""}});

/* ---------- onboarding documents ---------- */
const ONB_CATS=["Induction checklist","Staff handbook","Policy","Procedure","Job description","Training guide","Form or template","Other"];
const ONB_META=[["category","Type","cat"],["audience","Who it's for","text"],["owner","Owner","text"],["date","Dated","date"],["reviewDate","Next review","date"]];
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
  if(!list.length)box.append(el("div",{class:"empty",text:`No onboarding documents yet.${ro()?"":" Tap Add to start an induction checklist or a blank document."}`}));
  for(const d of list){
    ids.push(d.updatedBy);const rs=reviewState(d);
    box.append(el("button",{class:"lrow",type:"button",onclick:()=>openOnb(d.id,null,"view")},el("span",{class:"tile indigo"},svgi(ICON.onboarding)),
      el("span",{class:"t"},el("b",{text:d.title||"Untitled document"}),el("span",{class:"s",text:[d.category,d.audience?"for "+d.audience:"",`updated ${when(d.updatedAt)}, ${nameOf(d.updatedBy)}`].filter(Boolean).join(" · ")})),
      d.reviewDate?el("span",{class:"pill "+rs.cls,text:rs.text}):null,el("span",{class:"chev"},svgi(ICON.chevR))));
  }
  renderAddBtn();resolveNames(ids);
}
function openOnb(id,data,mode){
  const p=data||S.onboarding.find(x=>x.id===id);if(!p)return;
  S.onb={id,doc:clone(p),baseAt:p.updatedAt,dirty:false,remote:false,mode:ro()?"view":(mode||"view")};
  $("#obListView").hidden=true;$("#obEditView").hidden=false;renderOnbEditor();window.scrollTo({top:0});renderAddBtn();
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
    if(ok){msg.textContent="";toast(`Saved ${v.name}`);editContact(null)}
  }},"Save contact");
  box.append(f,el("div",{class:"row"},saveBtn,cancel,del,msg));box._cancel=cancel;box._del=del;box._msg=msg;
}
function editContact(c,typeOnly){
  editCon=c?c.id:null;$("#cFormTitle").textContent=c?"Edit "+c.name:"Add a contact";
  for(const[k]of CON_FIELDS)$("#c_"+k).value=c?(c[k]||(k==="type"?"Other":"")):(k==="type"?(typeOnly||CON_TYPES[0]):"");
  $("#cForm")._cancel.hidden=true;$("#cForm")._del.hidden=!c;
  setForm("contacts",!!(c||typeOnly));
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
  if(!list.length)box.append(el("div",{class:"empty glass",text:"No contacts yet. Start with your council's food safety team, pest control and your fridge engineer."}));
  const row=c=>xrow("c"+c.id,{
    title:c.name,sub:[c.person,c.type].filter(Boolean).join(" · "),
    right:[callBtn(c.outOfHours||c.phone,"Call "+c.name)],
    details:[xfacts([["Phone",c.phone?telLink(c.phone):""],["Out of hours",c.outOfHours?telLink(c.outOfHours):""],["Email",c.email?el("a",{href:"mailto:"+c.email,text:c.email}):""],["Reference",c.account],["Notes",c.notes]]),
      ro()?null:el("div",{class:"row"},el("button",{class:"btn ghost sm",type:"button",onclick:()=>editContact(c)},"Edit contact"))]});
  // Anyone with an out-of-hours number goes first: that's who you need in a hurry.
  const urgent=list.filter(c=>c.outOfHours);
  if(urgent.length)box.append(el("div",{class:"label bad",text:"Emergency and out of hours"}),el("div",{class:"list glass"},...urgent.map(row)));
  let cur=null,grp=null;
  for(const c of list.filter(c=>!c.outOfHours)){
    if(c.type!==cur){cur=c.type;grp=el("div",{class:"list glass"});box.append(el("div",{class:"label",text:c.type||"Other"}),grp)}
    grp.append(row(c));
  }
  const have=new Set(list.map(c=>c.type));
  const sug=$("#cSuggest");sug.replaceChildren();
  const missing=["Local council / environmental health","Pest control","Fridge & freezer engineer","Coffee machine technician","Gas engineer","Electrician","Plumber","Water supplier","Doctor / NHS 111","Key holder / manager"].filter(t=>!have.has(t));
  for(const t of missing)sug.append(el("button",{class:"btn ghost sm",type:"button",onclick:()=>editContact(null,t)},"+ "+t));
  $("#cSuggestPanel").hidden=ro()||!missing.length;
  $("#cFormPanel").hidden=ro()||!formOpen.contacts;
}

/* ---------- staff training ---------- */
// The training topics this site uses: Setup's trainingOff lists the ones it doesn't need.
// Dates already recorded for a switched-off topic are kept, just not shown or counted.
const siteTopics=()=>TOPICS.filter(([k])=>!S.settings.trainingOff.includes(k));
function staffForm(){
  const box=$("#tTopics");
  for(const[k,lbl]of TOPICS)box.append(el("div",{class:"field","data-topic":k},el("label",{class:"label",for:"tt_"+k,text:lbl}),el("input",{type:"date",id:"tt_"+k})));
  // Most training happens on one day: fill every topic shown with one date.
  $("#tAllApply").addEventListener("click",()=>{
    const d=$("#tAllDate").value;if(!d){$("#tMsg").textContent="Choose a date to apply first.";$("#tAllDate").focus();return}
    for(const[k]of siteTopics())$("#tt_"+k).value=d;
    $("#tMsg").textContent="";toast(`${short(d)} applied to all ${siteTopics().length} topics. Save to keep it.`);
  });
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
    if(done.length){editStaff(null);$("#tMsg").textContent="";toast(`Saved ${name} to ${done.join(", ")}`+(done.length<sites.length?". Some sites couldn't be saved; try again.":""))}
  });
  $("#tCancel").addEventListener("click",()=>editStaff(null));
  armDelete($("#tDelete"),"Remove person",async()=>{if(await save(()=>D("staff",S.editStaff).delete())){editStaff(null);toast("Removed")}});
}
function editStaff(p){
  S.editStaff=p?p.id:null;$("#tFormTitle").textContent=p?"Edit "+p.name:"Add a staff member";
  $("#tName").value=p?p.name:"";$("#tRole").value=p?(p.role||""):"";$("#tStart").value=p?(p.start||""):"";$("#tNotes").value=p?(p.notes||""):"";
  for(const[k]of TOPICS)$("#tt_"+k).value=p&&p.topics&&p.topics[k]?p.topics[k].date:"";
  $("#tAllDate").value="";
  const on=p&&Array.isArray(p.sites)&&p.sites.length?p.sites:[S.site];
  document.querySelectorAll("#tSites input[data-site]").forEach(b=>b.checked=on.includes(b.dataset.site)||b.dataset.site===S.site&&!!p);
  $("#ts_all").checked=[...document.querySelectorAll("#tSites input[data-site]")].every(b=>b.checked);
  $("#tCancel").hidden=true;$("#tDelete").hidden=!p;
  setForm("staff",!!p);
}
// Record that someone was trained on one topic today.
async function trainedToday(p,k){
  const topics={...(p.topics||{}),[k]:{date:today(),by:S.me}};
  if(await save(()=>D("staff",p.id).update({topics})))toast(`${p.name}: ${TOPICS.find(t=>t[0]===k)[1]} recorded`);
}
// Untick a topic and it's no longer shown or counted at this site. Saved straight to the site's settings.
async function setTopicOff(k,on){
  const off=S.settings.trainingOff.filter(x=>x!==k);if(!on)off.push(k);
  if(off.length>=TOPICS.length){toast("Keep at least one topic");renderStaff();return}
  const patch={trainingOff:off,updatedBy:S.me,updatedAt:Date.now()};
  const ok=await save(()=>S.settings.fresh?D("settings","main",S.site).set({...storable(S.settings),...patch}):D("settings","main",S.site).update(patch));
  if(ok)toast(`${TOPICS.find(t=>t[0]===k)[1]} ${on?"added back for":"removed from"} the ${curSite().name}`);else renderStaff();
}
function renderStaff(){
  const TOPICS=siteTopics();
  for(const n of document.querySelectorAll("#tTopics [data-topic]"))n.hidden=!TOPICS.some(([k])=>k===n.dataset.topic);
  const tb0=$("#tTopicToggles");tb0.replaceChildren();
  for(const[k,lbl]of ALL_TOPICS){
    const id="tto_"+k,cb=el("input",{type:"checkbox",id,disabled:ro()});cb.checked=TOPICS.some(t=>t[0]===k);
    cb.addEventListener("change",()=>setTopicOff(k,cb.checked));
    tb0.append(el("label",{for:id},cb,lbl));
  }
  $("#tTopicsPanel").hidden=ro();
  const list=[...S.staff].sort((a,b)=>a.name.localeCompare(b.name));
  const todo=p=>TOPICS.filter(([k])=>!(p.topics&&p.topics[k]));
  const full=list.filter(p=>!todo(p).length).length,gaps=list.length-full;
  const stat=(n,l,c)=>el("div",{class:"stat glass"},el("b",{class:c||"",text:n}),el("span",{text:l}));
  $("#tStats").replaceChildren(stat(String(list.length),list.length===1?"person":"people"),stat(String(full),"fully trained","ok"),stat(String(gaps),"training to do",gaps?"warn":"ok"));
  $("#tStats").hidden=!list.length;
  const box=$("#tList");box.replaceChildren();
  if(!list.length)box.append(el("div",{class:"empty",text:"No one listed yet. Add each member of staff with the dates they were trained."}));
  for(const p of list){
    const left=todo(p),done=TOPICS.length-left.length;
    box.append(xrow("t"+p.id,{
      lead:ringEl(done,TOPICS.length),title:p.name,
      sub:[p.role,left.length?`${left.length} to do`:"All training done"].filter(Boolean).join(" · "),
      right:[left.length?el("span",{class:"pill warn",text:`${done}/${TOPICS.length}`}):el("span",{class:"pill ok",text:"Trained"})],
      details:[el("ul",{class:"topics"},...TOPICS.map(([k,l])=>{const t=p.topics&&p.topics[k];
          return el("li",{class:t?"on":""},el("span",{class:"badge "+(t?"done":"")},t?svgi(ICON.check):""),el("span",{class:"t"},el("b",{text:l}),el("span",{class:"s",text:t?"Trained "+short(t.date):"Not yet"})),
            t||ro()?null:el("button",{class:"btn ghost sm",type:"button",onclick:()=>trainedToday(p,k)},"Trained today"))})),
        xfacts([["Started",p.start?short(p.start):""],["Sites",Array.isArray(p.sites)&&p.sites.length>1?p.sites.map(x=>siteOf(x).name).join(", "):""],["Notes",p.notes]]),
        ro()?null:el("div",{class:"row"},el("button",{class:"btn ghost sm",type:"button",onclick:()=>editStaff(p)},"Edit record"))]}));
  }
  const mx=$("#tMatrix");mx.replaceChildren();
  if(list.length){
    const head=el("tr",{},el("th",{text:"Name"}),...TOPICS.map(([,l])=>el("th",{class:"al",text:l})));
    const tb=el("tbody");
    for(const p of list)tb.append(el("tr",{},el("td",{},el("b",{text:p.name}),el("div",{class:"by",text:p.role||""})),
      ...TOPICS.map(([k])=>{const t=p.topics&&p.topics[k];return el("td",{class:"dt"+(t?"":" no"),text:t?short(t.date):"–"})})));
    mx.append(el("div",{class:"scroll"},el("table",{class:"matrix"},el("thead",{},head),tb)));
  }
  mx.closest("section").hidden=!list.length;
  $("#tFormPanel").hidden=ro()||!formOpen.staff;
}

/* ---------- allergens ---------- */
const algFilter=new Set();
const ALG_SHORT={"Cereals with gluten":"Gluten","Sulphur dioxide":"Sulphites"};
const algShort=a=>ALG_SHORT[a]||a.replace(/ \(.*\)$/,"");
function renderAllergens(){
  const items=[...S.allergens].sort((a,b)=>a.name.localeCompare(b.name));
  // "Free from" chips: tap allergens a customer must avoid, and the list shows only what's safe.
  const fb=$("#algFilter");fb.replaceChildren(el("span",{class:"s",text:"Free from"}));
  for(const a of ALLERGENS)fb.append(el("button",{type:"button",class:"fchip"+(algFilter.has(a)?" on":""),"aria-pressed":String(algFilter.has(a)),
    onclick:()=>{algFilter.has(a)?algFilter.delete(a):algFilter.add(a);renderAllergens()}},algShort(a)));
  const q=normT($("#algSearch").value);
  const shown=items.filter(it=>(!q||normT(it.name+" "+(it.source||"")).includes(q))&&![...algFilter].some(a=>(it.contains||[]).includes(a)));
  const box=$("#algList");box.replaceChildren();
  if(!items.length)box.append(el("div",{class:"empty",text:`No menu items yet.${ro()?"":" Tap Add item to add your first, then tick the allergens it contains."}`}));
  else if(!shown.length)box.append(el("div",{class:"empty",text:algFilter.size?`Nothing on the list is free from ${[...algFilter].map(algShort).join(", ")}.`:"No items match."}));
  for(const it of shown){
    const has=it.contains||[];
    box.append(xrow("a"+it.id,{
      title:it.name,sub:[it.source,it.notes].filter(Boolean).join(" · "),
      right:[el("span",{class:"agl"},...(has.length?has.map(a=>el("span",{class:"ag",text:algShort(a)})):[el("span",{class:"pill ok",text:"None of the 14"})]))],
      details:[xfacts([["Contains",has.join(", ")||"None of the 14 allergens"],["Notes",it.notes],["Source",it.source],["Checked",it.at?new Date(it.at).toLocaleDateString("en-GB")+(it.by?", "+nameOf(it.by):""):""],["Copied from",it.importedFrom?siteOf(it.importedFrom).name:""]]),
        ro()?null:el("div",{class:"row"},el("button",{class:"btn ghost sm",type:"button",onclick:()=>editAlg(it)},"Edit item"))]}));
  }
  const mx=$("#algMatrix");mx.replaceChildren();
  if(items.length){
    const head=el("tr",{},el("th",{text:"Item"}),...ALLERGENS.map(a=>el("th",{class:"al",text:algShort(a)})));
    const tb=el("tbody");
    for(const it of items){const h=new Set(it.contains||[]);
      tb.append(el("tr",{},el("td",{},el("b",{text:it.name}),it.notes?el("div",{class:"by",text:it.notes}):null),...ALLERGENS.map(a=>el("td",{class:"c"},h.has(a)?el("span",{class:"y",title:a,text:"●"}):""))))}
    mx.append(el("div",{class:"scroll"},el("table",{class:"matrix"},el("thead",{},head),tb)));
  }
  mx.closest("section").hidden=!items.length;
  $("#algFormPanel").hidden=ro()||!formOpen.allergens;
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
  $("#algCancel").hidden=true;$("#algDelete").hidden=!it;
  setForm("allergens",!!it);
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
  const untrained=S.staff.filter(p=>siteTopics().some(([k])=>!(p.topics&&p.topics[k]))).length;
  // What happened since the last review, each linked to where it's recorded.
  const nPlans=S.plans.filter(d=>reviewState(d).overdue).length,lastInsp=inspSorted()[0],nEho=lastInsp?(lastInsp.issues||[]).filter(i=>!i.done).length:0;
  const pl=(n,w)=>`${n} ${w}${n===1?"":"s"}`;
  const facts=[["history",`${comp} of ${days} days complete`,comp===days?"ok":"warn"],["history",pl(temps,"day")+" with temperature problems",temps?"bad":"ok"],
    ["prove",pl(pFail,"failed Prove it check"),pFail?"bad":"ok"],["cleaning",pl(kOver,"cleaning job")+" overdue",kOver?"bad":"ok"],["extras",pl(xOver,"extra check")+" overdue",xOver?"bad":"ok"],
    ["staff",pl(untrained,"person")+" with training to do",untrained?"warn":"ok"],["plans",pl(nPlans,"HACCP or risk document")+" due for review",nPlans?"bad":"ok"],
    ...(lastInsp?[["eho",pl(nEho,"EHO issue")+" still open",nEho?"bad":"ok"]]:[])].filter(([t])=>canTab(t));
  $("#revSummary").replaceChildren(el("div",{class:"s",text:`Since ${nice(start)}`}),...facts.map(([t,text,c])=>
    el("button",{class:"lrow",type:"button",onclick:()=>show(t)},el("span",{class:"sdot "+c}),el("span",{class:"t"},el("b",{text})),el("span",{class:"chev"},svgi(ICON.chevR)))));
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
  adFile=f||null;$("#adDropText").textContent=adFile?adFile.name:"or drop one here";$("#adDrop").classList.toggle("has",!!adFile);
  if(adFile&&!$("#adTitle").value.trim())$("#adTitle").value=adFile.name.replace(/\.pdf$/i,"");
  if(adFile)$("#adMsg").textContent="";
  $("#adSave").disabled=!adFile||adBusy;
}
function renderAllergenDocs(){
  const box=$("#adList");box.replaceChildren();const ids=[];
  const list=[...S.allergenDocs].sort((a,b)=>(b.at||0)-(a.at||0));
  const upload=()=>{const w=$("#adUpWrap");w.hidden=false;w.open=true;w.scrollIntoView({behavior:"smooth",block:"start"})};
  if(!list.length)box.append(el("div",{class:"pdfcard glass none"},el("span",{class:"tile grey"},svgi(ICON.doc)),el("span",{class:"t"},el("b",{text:"No allergen PDF yet"}),
    el("span",{class:"s",text:`The ${curSite().name}'s allergen matrix, so staff can open it here.`})),ro()||!S.assets?null:el("button",{class:"btn sm",type:"button",onclick:upload},"Upload")));
  list.forEach((d,i)=>{
    ids.push(d.by);
    const url="/_blob/"+d.assetId;
    let del=null;
    if(!ro()&&S.assets){
      del=el("button",{class:"btn ghost sm danger",type:"button"},"Remove");
      armDelete(del,"Remove",async()=>{
        if(await save(()=>D("allergenDocs",d.id).delete())){try{await S.assets.delete(d.assetId)}catch(e){}toast("PDF removed")}
      });
    }
    box.append(el("div",{class:"pdfcard glass"+(i?" old":"")},
      el("span",{class:"tile red"},svgi(ICON.doc)),
      el("span",{class:"t"},el("b",{text:d.title||d.fileName||"Allergen information"}),
        el("span",{class:"s",text:[i===0?"Latest":"",d.size?kb(d.size):"",`${when(d.at)}, ${nameOf(d.by)}`].filter(Boolean).join(" · ")}),
        d.note?el("span",{class:"s",text:d.note}):null),
      el("a",{class:"btn sm"+(i?" ghost":""),href:url,target:"_blank",rel:"noopener"},"Open"),del));
  });
  const can=!ro()&&!!S.assets;
  $("#adUpload").hidden=!can;$("#adNoUpload").hidden=can||!S.db;
  // With no PDF yet, the card's Upload button opens the form; afterwards it's a link under the PDFs.
  const w=$("#adUpWrap");w.hidden=!S.db||(!list.length&&!w.open);
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
function goDay(date){S.date=date;show("day");renderDay();renderHead()}
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
  plus:'<path d="M12 5v14M5 12h14"/>',doc:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  out:'<path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',warn:'<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',dot:'',
  pen:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',lock:'<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/>',
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
// One line of live status for a section in the Records and More lists, so you can see where to go.
function hubSub(id){
  if(!S.db)return "";
  const n=(k,w)=>`${k} ${w}${k===1?"":"s"}`;
  const t=today();
  switch(id){
    case "extras":case "cleaning":{
      const xs=S[id].map(x=>({x,st:taskState(x),due:dueDate(x)}));if(!xs.length)return "Nothing listed yet";
      const over=xs.filter(a=>a.st.overdue),todayN=xs.filter(a=>!a.st.overdue&&a.st.cls==="warn"&&FREQ[a.x.freq]>0);
      if(over.length)return `Overdue: ${over.map(a=>a.x.name).slice(0,2).join(", ")}${over.length>2?` and ${over.length-2} more`:""}`;
      if(todayN.length)return `Due today: ${todayN.map(a=>a.x.name).slice(0,2).join(", ")}`;
      const next=xs.filter(a=>a.due).sort((a,b)=>a.due.localeCompare(b.due))[0];
      return next?`All up to date · next ${next.x.name}, ${nice(next.due)}`:`${n(xs.length,id==="cleaning"?"job":"check")}, all up to date`;
    }
    case "prove":{const r=[...S.prove].sort((a,b)=>(b.at||0)-(a.at||0))[0];return r?`Last: ${r.food}, ${r.pass?"pass":"fail"} · ${short(r.date)}`:"No checks recorded yet"}
    case "allergens":return `${n(S.allergens.length,"menu item")} · ${S.allergenDocs.length?"PDF uploaded":"no PDF yet"}`;
    case "history":{let c=0,tr=0;for(let i=1;i<=28;i++){const d=addDays(t,-i),st=dayStatus(S.days[d]);if(isClosed(d)&&!st.any)continue;tr++;if(st.complete)c++}return `${c} of ${tr} days complete`}
    case "eho":{const l=inspSorted()[0];if(!l)return "No inspection recorded";const o=(l.issues||[]).filter(i=>!i.done).length;return `Rating ${l.rating??"–"} · ${o?n(o,"issue")+" open":"no open issues"}`}
    case "plans":{const due=S.plans.filter(d=>reviewState(d).overdue).length;return S.plans.length?`${n(S.plans.length,"document")}${due?` · ${due} due for review`:""}`:"None yet: start from a template"}
    case "suppliers":return S.suppliers.length?n(S.suppliers.length,"supplier"):"None listed yet";
    case "contacts":{const e=S.contacts.filter(c=>c.outOfHours).length;return S.contacts.length?`${n(S.contacts.length,"contact")}${e?` · ${e} out of hours`:""}`:"None listed yet"}
    case "staff":{const g=S.staff.filter(p=>siteTopics().some(([k])=>!(p.topics&&p.topics[k]))).length;return S.staff.length?(g?`${g} of ${S.staff.length} with training to do`:"Everyone trained"):"No one listed yet"}
    case "onboarding":return S.onboarding.length?n(S.onboarding.length,"document"):"None yet: start from a template";
    case "review":{const{due}=reviewPeriod(),left=Math.round((parse(due)-parse(t))/864e5);return left<0?`Overdue since ${nice(due)}`:left===0?"Due today":`Next due ${nice(due)}`}
    case "setup":return "Checks, fridges, opening days and sections";
  }
  return "";
}
function navRow(n,onclick){
  const b=navBadge(n.id),sub=hubSub(n.id)||n.sub;
  return el("button",{class:"lrow",type:"button",onclick},el("span",{class:"tile "+(n.tile||"blue")},svgi(ICON[n.ic])),
    el("span",{class:"t"},el("b",{text:n.t}),sub?el("span",{class:"s",text:sub}):null),b?el("span",{class:"pill "+b.cls,text:b.text}):null,el("span",{class:"chev"},svgi(ICON.chevR)));
}
function renderNav(){
  // Until we know who is signed in, list only what every role can open.
  const vis=NAV.filter(n=>canTab(n.id)&&(S.role||!MANAGER_TABS.has(n.id)));
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
  const fade=()=>sn.classList.toggle("more",sn.scrollHeight-sn.scrollTop-sn.clientHeight>4);
  sn.onscroll=fade;requestAnimationFrame(fade);
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
  return[...(S.quickSwitch?[["Switch person","staff","teal",openPeopleSheet]]:[]),
    ...(S.role&&S.role!=="admin"?[[S.quickPin?"Change quick PIN":"Set a quick PIN","key","indigo",setQuickPin]]:[]),
    ["Change password","key","grey",()=>{location.href="/signin#change"}],
    ...(S.role==="admin"?[["Admin","shield","blue",()=>{location.href="/admin"}]]:[]),
    ["Sign out","out","red",signOut,true]];
}

/* ---------- quick switching (shared devices) ----------
 * On a device someone has signed in on with a password, staff and managers switch to themselves with a
 * 4-digit quick PIN (pinpad.js) instead of signing out and in. */
async function authPost(route,body){
  let r;try{r=await fetch("/api/auth/"+route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})}
  catch(e){return{ok:false,message:"Couldn't reach the diary. Check your connection."}}
  const j=await r.json().catch(()=>({}));return r.ok?{ok:true,...j}:{ok:false,message:j.message||"Something went wrong."};
}
function setQuickPin(){
  PinPad.open({title:"Choose a quick PIN",sub:"4 digits, to switch to yourself on shared devices",onPin:async first=>{
    setTimeout(()=>PinPad.open({title:"Enter it again",sub:"To check it",onPin:async again=>{
      if(again!==first)return "Those didn't match. Start again by choosing a PIN.";
      const r=await authPost("pin",{pin:first});if(!r.ok)return r.message;
      S.quickPin=true;renderNav();toast("Quick PIN set. Use Switch person on a shared device.");return null;
    }}),250);
    return null;
  }});
}
async function openPeopleSheet(){
  const box=$("#peopleList");box.replaceChildren(el("div",{class:"empty",text:"Loading…"}));
  $("#sheetVeil").hidden=false;$("#peopleSheet").hidden=false;
  let people=[];try{people=(await (await fetch("/api/auth/people")).json()).people||[]}catch(e){}
  box.replaceChildren(...people.map(p=>el("button",{class:"lrow"+(p.name===S.myName?" on":""),type:"button","aria-current":p.name===S.myName?"true":null,onclick:()=>{
      if(p.name===S.myName){closeSheets();return}
      closeSheets();
      PinPad.open({title:`Hi ${firstName(p.name)}`,sub:"Enter your quick PIN",onPin:async pin=>{
        const r=await authPost("switch",{id:p.id,pin});if(!r.ok)return r.message;
        location.reload();return null;
      }});
    }},el("span",{class:"avatar sm",text:initials(p.name)}),el("span",{class:"t"},el("b",{text:p.name}),p.name===S.myName?el("span",{class:"s",text:"Recording now"}):null))));
  if(!people.length)box.replaceChildren(el("div",{class:"empty",text:"No one has a quick PIN yet. Each person sets one from this menu."}));
  $("#peopleNote").replaceChildren("Not listed? ",el("a",{href:"#",onclick:e=>{e.preventDefault();signOut()}},"Sign in with your password"),".");
}

/* ---------- connection: changes made offline wait on this device (claude-shim.js) ---------- */
window.addEventListener("diary:connection",e=>{
  const{offline,pending}=e.detail,c=$("#conn");
  const was=!c.hidden;
  c.hidden=!offline&&!pending;
  c.textContent=offline?`Offline${pending?` · ${pending} change${pending===1?"":"s"} waiting`:""}`:`Saving ${pending} change${pending===1?"":"s"}…`;
  c.title=offline?"No connection. Changes are kept on this device and save when it's back.":"";
  if(was&&c.hidden)toast("Back online. All changes saved.");
});
window.addEventListener("diary:dropped",e=>toast("A change couldn't be saved: "+(e.detail.message||"refused by the diary")));
async function signOut(){try{await fetch("/api/auth/logout",{method:"POST"})}catch(e){}location.replace("/signin")}
function renderMe(){
  $("#avatarBtn").textContent=initials(S.myName);
  $("#meBox").replaceChildren(el("span",{class:"avatar sm",text:initials(S.myName)}),
    el("span",{class:"t"},el("b",{text:S.myName||"Signed in"}),el("span",{class:"s",text:{admin:"Admin",manager:"Manager",staff:"Staff"}[S.role]||""})),svgi(ICON.chevR));
}
/* sheets and the account menu */
function closeSheets(){$("#sheetVeil").hidden=true;$("#siteSheet").hidden=true;$("#peopleSheet").hidden=true;$("#acctMenu").hidden=true}
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

function renderAll(){renderSites();renderNav();renderHead();renderAddBtn();renderDay();renderWeek();renderHistory();renderTasks("extras");renderTasks("cleaning");renderProve();renderAllergenDocs();renderAllergens();renderPlansList();renderSuppliers();renderContacts();renderStaff();renderOnbList();renderInspList();renderReview();renderSetup()}

/* ---------- tabs ---------- */
const TABS=["day","week","history","extras","cleaning","prove","allergens","eho","plans","suppliers","contacts","staff","onboarding","review","setup","records","more"];
function show(tab,opts){
  if(!TABS.includes(tab))tab="day";
  if(!canTab(tab)){if(S.role==="staff"&&MANAGER_TABS.has(tab)&&!(opts&&opts.quiet))toast("That section is for managers.");tab="day"}
  const changed=S.tab!==tab;
  S.tab=tab;
  document.querySelectorAll("[data-panel]").forEach(p=>p.hidden=p.dataset.panel!==tab);
  if(changed)for(const n of[document.querySelector(`[data-panel="${tab}"]`),$("#pagehead")])if(n){n.classList.remove("enter");void n.offsetWidth;n.classList.add("enter")}
  $("#dayCtl").hidden=tab!=="day";$("#weekCtl").hidden=tab!=="week";updFab();
  renderHead();renderNav();renderAddBtn();
  if(changed&&!(opts&&opts.keepScroll))window.scrollTo({top:0});
  try{localStorage.setItem("sfbb.tab",tab)}catch(e){}
}
// The large title, its subtitle and (on phones) a back link to Records or More.
function renderHead(){
  const t=S.tab,n=navOf(t);
  const thisWk=S.week===monday(today());
  const title=t==="records"?"Records":t==="more"?"More":t==="day"?(S.date===today()?"Today":S.date===addDays(today(),-1)?"Yesterday":"Diary"):t==="week"?(thisWk?"This week":"Week"):n?n.t:"";
  const sub=t==="day"?parse(S.date).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}):t==="week"?`${nice(S.week)} – ${nice(addDays(S.week,6))}`:curSite().name;
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
  if(adBusy){toast("Wait for the upload to finish before switching site.");return}
  if(S.plan)closePlan();if(S.insp)closeInsp();if(S.onb)closeOnb();
  S.site=id;try{localStorage.setItem("sfbb.site",id)}catch(e){}
  Object.assign(S,{days:{},weeks:{},allergens:[],allergenDocs:[],reviews:[],extras:[],cleaning:[],suppliers:[],contacts:[],plans:[],onboarding:[],inspections:[],staff:[],prove:[],rev:{}});
  S.settings=S.sum[id]&&S.sum[id].ready?S.sum[id].settings:normSettings(null);S.cfg=activeCfg(S.settings);
  SE=null;setupDirty=false;pubNote="";$("#setupMsg").textContent="";
  editTask("extras",null);editTask("cleaning",null);editSupplier(null);editContact(null);editStaff(null);editAlg(null);
  setAdFile(null);
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
  const hub=()=>{if(S.tab==="records"||S.tab==="more")renderNav()};
  const list=(col,key,after,q)=>sub(q||C(col,site),x=>{S[key]=x.docs.map(d=>({id:d.id,...d.data()}));after();hub()});
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
  const upd=()=>{renderSites();renderNav();if(S.tab==="day")renderDay();renderPublish()};
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
$("#dayPrev").addEventListener("click",()=>{S.date=addDays(S.date,-1);renderDay();renderHead()});
$("#dayNext").addEventListener("click",()=>{if(S.date<today()){S.date=addDays(S.date,1);renderDay();renderHead()}});
$("#saveProb").addEventListener("click",async()=>{await patchDay(S.date,{problems:{text:$("#problems").value.trim(),...stamp()}});toast("Note saved")});
$("#wkPrev").addEventListener("click",()=>{S.week=addDays(S.week,-7);renderWeek();renderHead()});
$("#wkNext").addEventListener("click",()=>{S.week=addDays(S.week,7);renderWeek();renderHead()});
$("#wkSaveNote").addEventListener("click",async()=>{await patchWeek(S.week,{notes:{text:$("#wkNotes").value.trim(),...stamp()}});toast("Note saved")});
$("#algSave").addEventListener("click",async()=>{
  const name=$("#algName").value.trim();if(!name){$("#algConfirm").textContent="Give the item a name first.";return}
  const contains=[...document.querySelectorAll("#algChecks input:checked")].map(c=>c.value);
  const body={name,source:$("#algSupplier").value.trim(),contains,notes:$("#algNotes").value.trim(),by:S.me,at:Date.now()};
  const ok=S.editAlg?await save(()=>D("allergens",S.editAlg).set(body)):await save(()=>C("allergens").add(body));
  if(ok){$("#algConfirm").textContent="";toast(`Saved ${name}`);editAlg(null)}
});
$("#algCancel").addEventListener("click",()=>editAlg(null));
$("#algSearch").addEventListener("input",renderAllergens);
armDelete($("#algDelete"),"Remove item",async()=>{if(await save(()=>D("allergens",S.editAlg).delete())){editAlg(null);toast("Item removed")}});
$("#revSave").addEventListener("click",async()=>{
  if(REVIEW_QS.some(([k])=>!(S.rev[k]&&S.rev[k].a))){$("#revMsg").textContent="Answer every question before signing.";return}
  const date=today();
  if(await save(()=>D("reviews",date).set({date,answers:S.rev,notes:$("#revNotes").value.trim(),by:S.me,at:Date.now()}))){S.rev={};$("#revNotes").value="";$("#revMsg").textContent="Review signed and saved."}
});
document.querySelectorAll(".note.intro").forEach(n=>{n.setAttribute("title","Tap to read more");n.addEventListener("click",()=>n.classList.toggle("full"))});

/* ---------- boot ---------- */
buildAlgChecks();buildTaskForm("extras");buildTaskForm("cleaning");proveForm();supForm();conForm();staffForm();editStaff(null);
applyTabs();renderAll();
(async()=>{
  const[db,user,assets]=await Promise.all([window.claude?.use?.("db"),window.claude?.use?.("user"),window.claude?.use?.("assets")]);
  S.db=db||null;S.user=user||null;S.assets=assets||null;
  if(!S.db){$("#offline").hidden=false;S.canWrite=false;renderAll();return}
  if(S.user){
    const me=await S.user.me();S.me=me.id;
    const w=await S.user.can("data.write");if(w===false){S.canWrite=false;$("#readonly").hidden=false}
    S.myName=me.name||"";S.role=me.role||"staff";S.quickPin=!!me.quickPin;S.quickSwitch=!!me.quickSwitch;renderMe();
    if(!canTab(S.tab))show("day",{quiet:true});else renderNav();
  }
  subscribeSummaries();
  subscribeSite();
  renderAll();
})();

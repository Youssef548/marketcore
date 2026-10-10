import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Writes beside this script, so the generator is portable and a rerun updates
// the committed SVGs in place.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'flows');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------- palette ----------
const ACTORS = {
  Buyer:        { stroke:'#2f6fb0', fill:'#eef4fb' },
  Seller:       { stroke:'#9a7b2e', fill:'#f7f2e4' },
  Web:          { stroke:'#6b5bb0', fill:'#f1eefb' },
  API:          { stroke:'#0e6b5c', fill:'#e9f3f0' },
  Database:     { stroke:'#5d7a34', fill:'#eef3e6' },
  Worker:       { stroke:'#a5651f', fill:'#f8efe2' },
  Provider:     { stroke:'#a13b3b', fill:'#f8ecec' },
  'Alt outcome':{ stroke:'#8a4b47', fill:'#f7eae9' },
};
const INK='#1b1a18', MUTED='#6d6a63', LINE='#c9c3b7', PAPER='#ffffff';
const FONT='Helvetica, Arial, sans-serif';
const W=210, H=74, COL=W+104, ROW=H+64, GUT=190, M=48, TITLE=74, BOTTOM=48;

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function wrap(text, max){
  const words=String(text).split(/\s+/); const lines=[]; let cur='';
  for(const w of words){ if((cur+' '+w).trim().length>max && cur){lines.push(cur);cur=w;} else cur=(cur+' '+w).trim(); }
  if(cur) lines.push(cur); return lines.slice(0,3);
}

function layout(flow){
  const incoming = new Map(flow.nodes.map(n=>[n.id,[]]));
  for(const e of flow.edges){ if(incoming.has(e.to)) incoming.get(e.to).push(e.from); }
  const col = new Map();
  const visit = (id, seen)=>{
    if(col.has(id)) return col.get(id);
    if(seen.has(id)) return 0;
    seen.add(id);
    const ins = incoming.get(id)||[];
    const c = ins.length ? Math.max(...ins.map(p=>visit(p,new Set(seen))))+1 : 0;
    col.set(id,c); return c;
  };
  flow.nodes.forEach(n=>visit(n.id,new Set()));
  for(const n of flow.nodes){
    n._col=col.get(n.id);
    n._lane=flow.lanes.indexOf(n.lane);
    n._x=GUT+n._col*COL;
    n._y=M+TITLE+n._lane*ROW;
  }
  return flow;
}

function nodeShape(n){
  const { stroke, fill } = ACTORS[n.lane] || ACTORS.API;
  const cx=n._x, cy=n._y+H/2, x=n._x-W/2, y=n._y;
  const lines=wrap(n.label,22);
  const t0=cy-(lines.length-1)*8+(n.sub?-6:0);
  if(n.type==='decision'){
    const p=`${cx},${y} ${x+W},${cy} ${cx},${y+H} ${x},${cy}`;
    return `<polygon points="${p}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`+
      `<text x="${cx}" y="${cy-(lines.length-1)*7+4}" text-anchor="middle" font-family="${FONT}" font-size="11.5" font-weight="600" fill="${INK}">`+
      lines.map((l,i)=>`<tspan x="${cx}" dy="${i?14:0}">${esc(l)}</tspan>`).join('')+`</text>`;
  }
  const rx=(n.type==='start'||n.type==='end')?H/2:8;
  return `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`+
    `<rect x="${x}" y="${y}" width="5" height="${H}" rx="2.5" fill="${stroke}"/>`+
    `<text x="${cx+3}" y="${t0}" text-anchor="middle" font-family="${FONT}" font-size="12.5" fill="${INK}">`+
    lines.map((l,i)=>`<tspan x="${cx+3}" dy="${i?16:0}">${esc(l)}</tspan>`).join('')+`</text>`+
    (n.sub?`<text x="${cx+3}" y="${t0+(lines.length-1)*16+15}" text-anchor="middle" font-family="${FONT}" font-size="10.5" fill="${MUTED}">${esc(n.sub)}</text>`:'');
}

function route(a,b){
  const sx=a._x+W/2, sy=a._y+H/2, tx=b._x-W/2, ty=b._y+H/2;
  const sameLane = a._lane===b._lane;
  // same lane, adjacent column: a straight run
  if(sameLane && Math.abs(b._col-a._col)===1) return {d:`M ${sx} ${sy} H ${tx}`, lx:(sx+tx)/2, ly:sy-12};
  // same lane but skipping columns: dip into the gap below the row so it does not cross a node
  if(sameLane && tx>sx){
    const ch=a._y+H+26;
    return {d:`M ${sx} ${sy} V ${ch} H ${tx} V ${ty}`, lx:(sx+tx)/2, ly:ch-8};
  }
  // different rows: small jog right, down/up, then across into the target's left edge
  const jog = sx+26;
  const y=(sy+ty)/2;
  if(tx>jog) return {d:`M ${sx} ${sy} H ${jog} V ${ty} H ${tx}`, lx:(jog+tx)/2, ly:y};
  // target sits to the left of the source: swing out and come back
  const back = Math.max(sx, b._x+W/2)+30;
  return {d:`M ${sx} ${sy} H ${back} V ${ty} H ${tx}`, lx:back+6, ly:y};
}
function edgeLabel(a,b,label){
  const {lx,ly}=route(a,b); const w=label.length*6.2+12;
  return `<rect x="${lx-w/2}" y="${ly-9}" width="${w}" height="18" rx="3" fill="${PAPER}" stroke="${LINE}"/>`+
    `<text x="${lx}" y="${ly+3.5}" text-anchor="middle" font-family="${FONT}" font-size="10.5" fill="${MUTED}">${esc(label)}</text>`;
}

function renderFlow(flow){
  layout(flow);
  const lanes=flow.lanes;
  const width=GUT+(Math.max(...flow.nodes.map(n=>n._col))+1)*COL-104+M+40;
  const height=M+TITLE+lanes.length*ROW-64+H+BOTTOM;
  const bands=lanes.map((l,i)=>{
    const y=M+TITLE+i*ROW-20, c=ACTORS[l]||ACTORS.API;
    return `<rect x="${M}" y="${y}" width="${width-M*2}" height="${ROW-14}" rx="6" fill="${c.fill}" opacity="0.5"/>`+
      `<text x="${M+16}" y="${y+(ROW-14)/2+4}" font-family="${FONT}" font-size="11" font-weight="700" fill="${c.stroke}" letter-spacing="0.06em">${esc(l.toUpperCase())}</text>`;
  }).join('');
  const defs=`<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${INK}"/></marker></defs>`;
  const byId=new Map(flow.nodes.map(n=>[n.id,n]));
  const edges=flow.edges.map(e=>{
    const a=byId.get(e.from), b=byId.get(e.to);
    return `<path d="${route(a,b).d}" fill="none" stroke="${INK}" stroke-width="1.4" opacity="0.72" marker-end="url(#a)"/>`+
      (e.label?edgeLabel(a,b,e.label):'');
  }).join('');
  const header=`<text x="${M}" y="38" font-family="${FONT}" font-size="19" font-weight="700" fill="${INK}">${esc(flow.title)}</text>`+
    `<text x="${M}" y="58" font-family="${FONT}" font-size="12" fill="${MUTED}">${esc(flow.subtitle||'')}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`+
    `<rect width="${width}" height="${height}" fill="${PAPER}"/>`+defs+header+bands+edges+flow.nodes.map(nodeShape).join('')+`</svg>`;
}

// ---------------- content ----------------
const ALT='Alt outcome';
const PHASES=[
 { id:'1-live', name:'Live today', sub:'Phases 0–3 + web session slice',
   flows:[
    {title:'Sign up',subtitle:'Registration creates the user only',lanes:['Buyer','Web','API','Database',ALT],
     nodes:[
      {id:'s',type:'start',lane:'Buyer',label:'Open /register'},
      {id:'f',type:'screen',lane:'Web',label:'Submit email + password'},
      {id:'p',type:'decision',lane:'API',label:'Password policy OK?'},
      {id:'dup',type:'decision',lane:'API',label:'Email already used?'},
      {id:'c',type:'action',lane:'API',label:'Hash (argon2id) + create User'},
      {id:'db',type:'action',lane:'Database',label:'INSERT user'},
      {id:'e',type:'end',lane:'Web',label:'→ /login?registered=1'},
      {id:'err',type:'action',lane:ALT,label:'400 / 409 error envelope',sub:'no hashing if refused'},
     ],
     edges:[{from:'s',to:'f'},{from:'f',to:'p'},{from:'p',to:'dup',label:'yes'},{from:'p',to:'err',label:'no'},
            {from:'dup',to:'c',label:'no'},{from:'dup',to:'err',label:'yes'},{from:'c',to:'db'},{from:'db',to:'e'}]},
    {title:'Sign in & session',subtitle:'Tokens never touch script',lanes:['Buyer','Web','API',ALT],
     nodes:[
      {id:'s',type:'start',lane:'Buyer',label:'Open /login, submit'},
      {id:'b',type:'action',lane:'Web',label:'BFF POST /api/auth/login'},
      {id:'v',type:'decision',lane:'API',label:'Credentials valid?'},
      {id:'t',type:'action',lane:'API',label:'Issue access + refresh, open Session'},
      {id:'ck',type:'action',lane:'Web',label:'Set httpOnly cookies'},
      {id:'d',type:'end',lane:'Web',label:'/dashboard → pick organization'},
      {id:'e',type:'action',lane:ALT,label:'401 — same for unknown email',sub:'no enumeration oracle'},
     ],
     edges:[{from:'s',to:'b'},{from:'b',to:'v'},{from:'v',to:'t',label:'yes'},{from:'v',to:'e',label:'no'},{from:'t',to:'ck'},{from:'ck',to:'d'}]},
    {title:'Stay signed in (rotation)',subtitle:'Single-flight refresh; a replay kills the session',lanes:['Web','API','Database',ALT],
     nodes:[
      {id:'s',type:'start',lane:'Web',label:'Request with stale access token'},
      {id:'sf',type:'action',lane:'Web',label:'Single-flight refresh (one call)'},
      {id:'r',type:'action',lane:'API',label:'Rotate refresh token'},
      {id:'rp',type:'decision',lane:'API',label:'Token already used?'},
      {id:'ok',type:'end',lane:'Web',label:'Store new cookies, retry once'},
      {id:'rev',type:'action',lane:ALT,label:'Revoke whole session',sub:'reuse detected'},
     ],
     edges:[{from:'s',to:'sf'},{from:'sf',to:'r'},{from:'r',to:'rp'},{from:'rp',to:'ok',label:'no'},{from:'rp',to:'rev',label:'yes'}]},
    {title:'Act inside one organization',subtitle:'Tenant resolved by a guard, never by a controller',lanes:['Seller','Web','API','Database',ALT],
     nodes:[
      {id:'s',type:'start',lane:'Seller',label:'Choose organization'},
      {id:'h',type:'action',lane:'Web',label:'Attach x-organization-id'},
      {id:'g',type:'decision',lane:'API',label:'Caller a member?'},
      {id:'q',type:'action',lane:'Database',label:'Scoped query'},
      {id:'ok',type:'end',lane:'API',label:'200 — tenant data'},
      {id:'e',type:'action',lane:ALT,label:'403 wrong header · 404 other tenant'},
     ],
     edges:[{from:'s',to:'h'},{from:'h',to:'g'},{from:'g',to:'q',label:'yes'},{from:'g',to:'e',label:'no'},{from:'q',to:'ok'}]},
    {title:'Manage a product',subtitle:'Enforced transitions; the CHECK lives in the DB',lanes:['Seller','API','Database',ALT],
     nodes:[
      {id:'s',type:'start',lane:'Seller',label:'Create product'},
      {id:'d',type:'action',lane:'API',label:'Status DRAFT'},
      {id:'p',type:'decision',lane:'API',label:'priceMinor ≥ 1?'},
      {id:'pub',type:'action',lane:'API',label:'PUBLISHED'},
      {id:'inv',type:'action',lane:'Database',label:'Inventory row — CHECK available ≥ 0'},
      {id:'e',type:'action',lane:ALT,label:'Reject publish — stays DRAFT'},
     ],
     edges:[{from:'s',to:'d'},{from:'d',to:'p'},{from:'p',to:'pub',label:'publish'},{from:'p',to:'e',label:'no'},{from:'pub',to:'inv'}]},
    {title:'Sign out',subtitle:'Revokes the session; access token expires on its own',lanes:['Buyer','Web','API'],
     nodes:[
      {id:'s',type:'start',lane:'Buyer',label:'Sign out'},
      {id:'r',type:'action',lane:'Web',label:'POST /api/auth/logout'},
      {id:'v',type:'action',lane:'API',label:'Revoke session (reason LOGOUT)'},
      {id:'c',type:'action',lane:'Web',label:'Clear cookies'},
      {id:'e',type:'end',lane:'Web',label:'→ /login?next=…'},
     ],
     edges:[{from:'s',to:'r'},{from:'r',to:'v'},{from:'v',to:'c'},{from:'c',to:'e'}]},
   ]},
 { id:'2-week3', name:'Week 3 · Phase 4', sub:'Transactional checkout + the stock-1 race',
   flows:[
    {title:'Checkout — 100 buyers, 1 unit',subtitle:'INV-1 — inventory never negative',lanes:['Buyer','API','Database',ALT],
     nodes:[
      {id:'s',type:'start',lane:'Buyer',label:'Checkout 1 unit'},
      {id:'tx',type:'action',lane:'API',label:'BEGIN transaction'},
      {id:'lock',type:'action',lane:'Database',label:'SELECT … FOR UPDATE (row lock)'},
      {id:'chk',type:'decision',lane:'API',label:'available ≥ requested?'},
      {id:'ord',type:'action',lane:'Database',label:'Insert Order + OrderItems'},
      {id:'dec',type:'action',lane:'Database',label:'Decrement available, bump version'},
      {id:'ob',type:'action',lane:'Database',label:'Write OutboxEvent'},
      {id:'cm',type:'end',lane:'API',label:'COMMIT — exactly 1 wins'},
      {id:'no',type:'action',lane:ALT,label:'Rollback → 409 out of stock',sub:'the other 99'},
     ],
     edges:[{from:'s',to:'tx'},{from:'tx',to:'lock'},{from:'lock',to:'chk'},{from:'chk',to:'ord',label:'yes'},{from:'chk',to:'no',label:'no'},
            {from:'ord',to:'dec'},{from:'dec',to:'ob'},{from:'ob',to:'cm'}]},
   ]},
 { id:'3-week4', name:'Week 4 · Phases 5–6', sub:'Idempotency and the payment simulator',
   flows:[
    {title:'Retry the same checkout',subtitle:'INV-2 — one key, one operation',lanes:['Buyer','API','Database'],
     nodes:[
      {id:'s',type:'start',lane:'Buyer',label:'20 repeats, one Idempotency-Key'},
      {id:'l',type:'action',lane:'API',label:'Look up (organizationId, key)'},
      {id:'k',type:'decision',lane:'API',label:'Key seen before?'},
      {id:'run',type:'action',lane:'API',label:'Run checkout once'},
      {id:'st',type:'action',lane:'Database',label:'Store status + response'},
      {id:'rep',type:'end',lane:'API',label:'Return stored response',sub:'replays are no-ops'},
     ],
     edges:[{from:'s',to:'l'},{from:'l',to:'k'},{from:'k',to:'run',label:'no'},{from:'k',to:'rep',label:'yes'},{from:'run',to:'st'},{from:'st',to:'rep'}]},
    {title:'Pay for an order',subtitle:'INV-3 — captured at most once',lanes:['API','Provider','Database',ALT],
     nodes:[
      {id:'s',type:'start',lane:'API',label:'Payment created (Pending)'},
      {id:'at',type:'action',lane:'Provider',label:'Attempt capture (simulator / Stripe test)'},
      {id:'r',type:'decision',lane:'API',label:'Capture succeeded?'},
      {id:'ok',type:'end',lane:'Database',label:'Succeeded + PaymentAttempt'},
      {id:'f',type:'action',lane:ALT,label:'Failed — needs a new attempt'},
     ],
     edges:[{from:'s',to:'at'},{from:'at',to:'r'},{from:'r',to:'ok',label:'yes'},{from:'r',to:'f',label:'no'}]},
   ]},
 { id:'4-week5', name:'Weeks 5–7 · Phases 7–9', sub:'Stripe, double-entry ledger, refunds',
   flows:[
    {title:'Payment webhook',subtitle:'INV-4 — each side effect at most once',lanes:['Provider','API','Database',ALT],
     nodes:[
      {id:'s',type:'start',lane:'Provider',label:'Stripe posts event (maybe twice)'},
      {id:'u',type:'decision',lane:'API',label:'(provider, eventId) seen?'},
      {id:'tr',type:'action',lane:'API',label:'Transition order / payment'},
      {id:'lg',type:'action',lane:'Database',label:'Write ledger transaction'},
      {id:'skip',type:'end',lane:ALT,label:'200 — no work',sub:'duplicate delivery'},
     ],
     edges:[{from:'s',to:'u'},{from:'u',to:'tr',label:'no'},{from:'u',to:'skip',label:'yes'},{from:'tr',to:'lg'}]},
    {title:'Capture posts to the ledger',subtitle:'INV-6 balances · INV-7 append-only',lanes:['API','Database'],
     nodes:[
      {id:'s',type:'start',lane:'API',label:'Capture 100, fee 10'},
      {id:'d',type:'action',lane:'Database',label:'Debit platform cash 100'},
      {id:'c1',type:'action',lane:'Database',label:'Credit seller payable 90'},
      {id:'c2',type:'action',lane:'Database',label:'Credit platform revenue 10'},
      {id:'z',type:'end',lane:'Database',label:'Signed entries sum to 0',sub:'per currency; never edited'},
     ],
     edges:[{from:'s',to:'d'},{from:'d',to:'c1'},{from:'c1',to:'c2'},{from:'c2',to:'z'}]},
    {title:'Refund a payment',subtitle:'INV-5 — refunds ≤ captures',lanes:['Seller','API','Provider','Database',ALT],
     nodes:[
      {id:'s',type:'start',lane:'Seller',label:'Request refund'},
      {id:'v',type:'decision',lane:'API',label:'Refund ≤ captured?'},
      {id:'e',type:'action',lane:ALT,label:'Reject — over cap'},
      {id:'p',type:'action',lane:'Provider',label:'Provider refund'},
      {id:'l',type:'action',lane:'Database',label:'Reversing ledger transaction'},
      {id:'ok',type:'end',lane:'API',label:'Succeeded / Failed'},
     ],
     edges:[{from:'s',to:'v'},{from:'v',to:'e',label:'no'},{from:'v',to:'p',label:'yes'},{from:'p',to:'l'},{from:'l',to:'ok'}]},
   ]},
 { id:'5-week8', name:'Weeks 8–9 · Phases 10–11', sub:'Outbox, worker, payouts, audit',
   flows:[
    {title:'Outbox event processed',subtitle:'INV-10 — recoverable after a crash',lanes:['API','Worker','Database',ALT],
     nodes:[
      {id:'s',type:'start',lane:'API',label:'Commit business state + OutboxEvent (one tx)'},
      {id:'cl',type:'action',lane:'Worker',label:'Claim pending rows (skip locked)'},
      {id:'sf',type:'action',lane:'Worker',label:'Perform side effect'},
      {id:'cr',type:'decision',lane:'Worker',label:'Worker crashed mid-flight?'},
      {id:'mk',type:'end',lane:'Database',label:'Mark processed — exactly once'},
      {id:'rt',type:'action',lane:ALT,label:'Row stays claimable → retried'},
     ],
     edges:[{from:'s',to:'cl'},{from:'cl',to:'sf'},{from:'sf',to:'cr'},{from:'cr',to:'mk',label:'no'},{from:'cr',to:'rt',label:'yes'}]},
    {title:'Two workers race one payout',subtitle:'INV-8 — payout executed at most once',lanes:['Worker','Database','Provider',ALT],
     nodes:[
      {id:'s',type:'start',lane:'Worker',label:'Both workers claim same Payout'},
      {id:'w',type:'decision',lane:'Database',label:'State predicate won?'},
      {id:'p',type:'end',lane:'Provider',label:'Exactly one provider transfer'},
      {id:'l',type:'action',lane:ALT,label:'Loser stops — no money moves'},
     ],
     edges:[{from:'s',to:'w'},{from:'w',to:'p',label:'yes'},{from:'w',to:'l',label:'no'}]},
    {title:'Audit a mutation',subtitle:'Every change is recorded immutably',lanes:['API','Database'],
     nodes:[
      {id:'s',type:'start',lane:'API',label:'Mutation performed'},
      {id:'a',type:'action',lane:'Database',label:'Append AuditLog (actor, org, action, before/after)'},
      {id:'r',type:'end',lane:'API',label:'Carry requestId — joins the log line'},
     ],
     edges:[{from:'s',to:'a'},{from:'a',to:'r'}]},
   ]},
 { id:'6-week10', name:'Weeks 10–12 · Phases 12–15', sub:'Telemetry, load, deploy, present',
   flows:[
    {title:'Prove it under load and in the cloud',subtitle:'No new invariant — evidence for the rest',lanes:['API','Worker'],
     nodes:[
      {id:'s',type:'start',lane:'API',label:'Telemetry / tracing'},
      {id:'k',type:'action',lane:'Worker',label:'k6 load scenario'},
      {id:'n',type:'action',lane:'API',label:'Published numbers'},
      {id:'d',type:'action',lane:'API',label:'AWS deployment'},
      {id:'e',type:'end',lane:'API',label:'Hardening + portfolio'},
     ],
     edges:[{from:'s',to:'k'},{from:'k',to:'n'},{from:'n',to:'d'},{from:'d',to:'e'}]},
   ]},
];

const written=[];
PHASES.forEach((ph,pi)=>ph.flows.forEach((f,fi)=>{
  const svg=renderFlow(f);
  const file=`${String(pi+1).padStart(2,'0')}-${String(fi+1).padStart(2,'0')}-${f.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}.svg`;
  fs.writeFileSync(path.join(OUT,file),svg);
  written.push({phase:ph.name,file,title:f.title,sub:ph.sub});
}));

const index=`<!doctype html><meta charset="utf-8"><title>MarketCore — UX flows</title>
<style>body{margin:0;background:#f6f4ef;font:15px/1.5 Helvetica,Arial,sans-serif;color:#1b1a18}
header{padding:30px 44px 10px}h1{font-size:23px;margin:0 0 6px}p{color:#6d6a63;margin:0;max-width:80ch}
.grid{padding:14px 44px 70px;display:grid;gap:30px}
.card{background:#fff;border:1px solid #e4dfd6;border-radius:10px;overflow:hidden}
.card h2{font-size:12.5px;margin:0;padding:11px 16px;border-bottom:1px solid #e4dfd6;color:#6d6a63;font-weight:600;display:flex;gap:10px;align-items:baseline}
.card h2 code{color:#9a968d;font-weight:400}
.card .cv{padding:16px;overflow:auto}
img{display:block}
.legend{display:flex;gap:16px;flex-wrap:wrap;padding:0 44px 6px;font-size:12px;color:#6d6a63}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}</style>
<header><h1>MarketCore — UX flows</h1><p>One diagram per flow, actors as swimlanes and a dedicated alternate-outcome lane. SVG exports — import into Figma or Canva. Generated from the README roadmap, <code>docs/domain-model.md</code> and <code>STATUS.md</code>.</p></header>
<div class="legend"><span><i style="background:#2f6fb0"></i>Buyer</span><span><i style="background:#9a7b2e"></i>Seller</span><span><i style="background:#6b5bb0"></i>Web BFF</span><span><i style="background:#0e6b5c"></i>API</span><span><i style="background:#5d7a34"></i>Database</span><span><i style="background:#a5651f"></i>Worker</span><span><i style="background:#a13b3b"></i>Provider</span><span><i style="background:#8a4b47"></i>Alternate outcome</span></div>
<div class="grid">${written.map(w=>`<div class="card"><h2>${esc(w.phase)} — ${esc(w.title)} <code>${esc(w.file)}</code></h2><div class="cv"><img src="${esc(w.file)}" alt="${esc(w.title)}"></div></div>`).join('')}</div>`;
fs.writeFileSync(path.join(OUT,'index.html'),index);

console.log('wrote',written.length,'svgs to',OUT);

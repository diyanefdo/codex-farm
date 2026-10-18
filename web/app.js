'use strict';
const $ = id => document.getElementById(id);
const state = {demo:false, history:false, farms:[], selected:null, filter:'all', search:'', pending:false, signature:''};
const palette = ['#627f9f','#b66d53','#8d7ba0','#bf9d56','#6b9474','#c58a98'];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function el(tag, cls, text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
function person(c,x,y,color,frame=0,manager=false){
  const step=frame%2;
  rect(c,x-4,y+13,12,3,'#5d793c55');
  rect(c,x-1,y+7,3,7+step,'#4e4a3d');rect(c,x+4,y+7,3,8-step,'#4e4a3d');
  rect(c,x-3,y,12,9,color);rect(c,x-5,y+1,3,6,'#e8b684');rect(c,x+9,y+1,3,6,'#e8b684');
  rect(c,x-1,y-7,8,8,'#efc08b');rect(c,x-2,y-9,10,4,'#71523e');rect(c,x+5,y-4,1,2,'#473f37');
  rect(c,x-4,y-9,14,3,manager?'#b37343':'#d5b877');rect(c,x-1,y-13,8,5,manager?'#ae6437':'#e0c583');
}
function tree(c,x,y,variant=0){rect(c,x-3,y,7,24,'#83683f');rect(c,x-14,y-10,30,15,'#508051');rect(c,x-20,y-24,41,20,'#5c8d52');rect(c,x-14,y-35,28,17,'#76a45e');rect(c,x-7,y-41,15,13,'#8eb86d');rect(c,x-17,y-19,8,7,'#86ac61');rect(c,x+8,y-7,10,7,'#3f714a');if(variant){rect(c,x+10,y-22,3,4,'#d7a260');rect(c,x-7,y-28,4,4,'#dca55b');}}
function fence(c,x,y,w){rect(c,x,y+3,w,3,'#e6d4a0');rect(c,x,y+11,w,3,'#d6bc86');for(let n=0;n<w;n+=18){rect(c,x+n,y,4,20,'#f1dca8');rect(c,x+n+3,y+2,2,18,'#bba16c');}}
function scene(canvas,farm,index,tick){
 const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;const W=400,H=150;
 rect(c,0,0,W,H,'#b9d594');rect(c,0,32,W,H-32,'#a5c67e');
 // A distant meadow, little flowers and a winding gravel lane.
 rect(c,0,24,W,13,'#b0cf87');rect(c,0,31,W,3,'#93b66c');
 for(let i=0;i<85;i++){const x=(i*73+index*19)%W,y=38+(i*31)%110;rect(c,x,y,2,2,i%4?'#94b66c':'#cfdfaa');if(i%13===0){rect(c,x,y-2,2,2,'#f5e9a8');rect(c,x+2,y,2,2,'#e7ba8d');}}
 rect(c,174,63,35,87,'#d5c398');rect(c,168,108,82,20,'#d5c398');
 for(let i=0;i<25;i++)rect(c,179+(i*7)%24,69+(i*19)%79,3,2,'#c6b28b');
 // Orchard and pond.
 tree(c,25,54,1);tree(c,66,45);tree(c,372,57,1);tree(c,346,36);
 rect(c,300,105,75,27,'#92b695');rect(c,307,101,61,33,'#e1d29f');rect(c,312,104,51,26,'#84b6b2');rect(c,321,101,32,30,'#84b6b2');rect(c,318,109,23,2,'#b2d1c3');rect(c,342,121,17,2,'#a5cbc3');rect(c,327,117,8,4,'#74966b');rect(c,332,115,2,2,'#f0d29d');
 // Wooden cottage and terracotta roof.
 rect(c,147,42,86,46,'#806846');rect(c,151,43,78,42,'#e4c78e');
 for(let y=47;y<85;y+=7)rect(c,151,y,78,1,'#cfb17b');
 rect(c,140,36,100,7,'#78563e');rect(c,145,29,90,7,'#b77550');rect(c,151,22,78,7,'#c58658');rect(c,158,15,64,7,'#d49867');rect(c,165,9,50,6,'#e0aa76');
 for(let y=18;y<38;y+=8)for(let x=154;x<226;x+=15)rect(c,x,y,9,1,'#ac6e4c');
 rect(c,214,8,9,15,'#9a745a');rect(c,212,6,13,4,'#c2a68a');
 rect(c,182,57,18,28,'#856744');rect(c,185,60,12,25,'#a5875d');rect(c,194,73,2,2,'#e4cb91');
 for(const x of [159,210]){rect(c,x,54,13,15,'#8c7250');rect(c,x+2,56,9,11,'#a6c9c2');rect(c,x+6,56,1,11,'#f1deae');rect(c,x+2,61,9,1,'#f1deae');rect(c,x-2,70,17,4,'#866741');rect(c,x,68,4,3,'#93ae65');rect(c,x+7,68,4,3,'#c88774');}
 fence(c,80,85,64);fence(c,237,85,61);fence(c,8,131,92);
 // Tilled vegetable beds and sprouts.
 for(let row=0;row<3;row++)for(let col=0;col<5;col++){const x=88+col*13,y=104+row*12;rect(c,x,y,10,8,'#a78358');rect(c,x+4,y-2,2,7,'#5d8446');rect(c,x+1,y-1,4,3,'#7d9f55');rect(c,x+6,y-3,4,3,'#91b668');if((row+col)%3===0)rect(c,x+3,y+2,4,3,'#d9ac5d');}
 // Mailbox, stones, and a manager's outdoor desk.
 rect(c,259,74,3,14,'#8b7654');rect(c,255,69,13,7,'#8c9cad');rect(c,261,66,2,5,'#b77862');
 rect(c,218,114,31,4,'#9a754b');rect(c,220,118,3,10,'#846340');rect(c,244,118,3,10,'#846340');rect(c,223,111,12,3,'#eee1bc');
 const members=farm.workers;const shown=members.slice(0,11);
 shown.forEach((worker,i)=>{let x,y;if(i===0){x=228;y=106;}else{x=68+((i-1)*47)%240;y=97+Math.floor((i-1)/5)*30;}
 const active=worker.state==='working',frame=active?Math.floor(tick/550):0;
 person(c,x,y,palette[i%palette.length],frame,i===0);
 if(active){rect(c,x+3,y-22,9,7,'#fff7d8');rect(c,x+5,y-15,2,2,'#fff7d8');rect(c,x+5,y-20,2,3,'#92a75b');}
 });
 if(members.length>11){c.font='7px monospace';c.fillStyle='#4a653b';c.fillText('+'+(members.length-11)+' in the fields',275,146);}
}
function avatar(index){const canvas=el('canvas','avatar');canvas.width=28;canvas.height=32;const c=canvas.getContext('2d');person(c,10,14,palette[index%palette.length],0,index===0);return canvas;}
function working(f){return f.workers.some(w=>w.state==='working');}
function label(f){return f.source==='demo'?'FICTIONAL DEMO':f.source==='session'?'RECORDED SESSION · PID UNVERIFIED':f.linked?'LINKED TERMINAL':'PROCESS · SESSION UNLINKED';}
function view(){let farms=state.farms.filter(f=>state.filter==='all'||(state.filter==='working'?working(f):!working(f)));const q=state.search.toLowerCase();if(q)farms=farms.filter(f=>[f.name,f.directory,...f.workers.map(w=>w.name+' '+w.task+' '+w.goal)].join(' ').toLowerCase().includes(q));return farms;}
function render(){
 const all=state.farms,workers=all.flatMap(f=>f.workers),farms=view();
 $('farm-count').textContent=all.length;$('agent-count').textContent=all.reduce((n,f)=>n+Math.max(0,f.workers.length-1),0);$('working-count').textContent=workers.filter(w=>w.state==='working').length;$('done-count').textContent=workers.filter(w=>['idle','done','paused'].includes(w.state)).length;
 $('farm-caption').textContent=state.history?'Recorded sessions from the last 24 hours':'Recent session activity and detected terminal instances';
 $('section-title').textContent=state.history?'The farm journal':'Around the farm';
 const grid=$('farms');grid.replaceChildren();
 farms.forEach((farm,index)=>{
  const card=el('article','farm-card'+(farm.id===state.selected?' selected':''));card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','View '+farm.name+' details');card.dataset.id=farm.id;
  const heading=el('div','card-heading'),names=el('div');names.append(el('small','',`HOMESTEAD ${String(index+1).padStart(2,'0')}`),el('h3','',farm.name));heading.append(names,el('span','badge'+(working(farm)?'':' quiet'),working(farm)?'● GROWING':'☾ RESTING'));
  const canvas=el('canvas','scene');canvas.width=400;canvas.height=150;canvas.setAttribute('aria-label',farm.workers.length+' farm characters beside their cottage');canvas.setAttribute('role','img');canvas.farm=farm;canvas.farmIndex=index;
  const meta=el('div','farm-meta');meta.append(el('span','',label(farm)),el('span','',`${farm.workers.length-1} farmhands`));
  const list=el('div','worker-list');farm.workers.forEach((w,i)=>{const row=el('div','worker'),body=el('div','worker-body'),name=el('div','worker-name');name.append(el('span','',i===0?'Manager':w.name),el('small','',i===0?'THE FARM OWNER':w.state.toUpperCase()));body.append(name,el('p','',w.task));row.append(avatar(i),body,el('span','state-dot '+w.state));list.append(row);});
  card.append(heading,canvas,meta,list);card.addEventListener('click',()=>select(farm.id));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(farm.id);}});grid.append(card);scene(canvas,farm,index,0);
 });
 $('empty').hidden=farms.length>0;$('empty-text').textContent=state.search||state.filter!=='all'?'No farms match those filters. Try another search or choose All activity.':state.history?'No compatible session logs found in the last 24 hours. Check the Codex log folder used by the local server.':'Start Codex in another terminal on this PC. Recent session activity will appear here; try Session history for older logs.';
 $('overview').classList.toggle('active',!state.history);$('history').classList.toggle('active',state.history);$('live').classList.toggle('selected',!state.demo);$('demo').classList.toggle('selected',state.demo);
 details();
}
function select(id){state.selected=state.selected===id?null:id;render();}
function details(){const panel=$('inspector'),farm=state.farms.find(f=>f.id===state.selected);panel.hidden=!farm;if(!farm)return;panel.replaceChildren();const close=el('button','close','×');close.setAttribute('aria-label','Close farm details');close.onclick=()=>{state.selected=null;render();};panel.append(close,el('span','eyebrow','A CLOSER LOOK'),el('h2','',farm.name),el('p','tiny',label(farm)),el('h4','','PROJECT FOLDER'),el('p','',farm.directory));
 farm.workers.forEach((w,i)=>{const block=el('div','detail-worker');block.append(el('h4','',(i===0?'MANAGER':w.name.toUpperCase())+' · '+w.state.toUpperCase()),el('p','',w.task));if(w.goal&&w.goal!==w.task)block.append(el('p','tiny','ORIGINAL REQUEST'),el('p','',w.goal));const ids=el('details');ids.append(el('summary','','Session identifier'),el('code','',w.id));block.append(ids);panel.append(block);});
 if(farm.observed_at)panel.append(el('p','tiny','Log modified '+new Date(farm.observed_at*1000).toLocaleString()));
 panel.append(el('p','tiny','Status reflects recorded events. A quiet log may still show the last task.'));
}
let generation=0;
async function refresh(){const token=generation;if(state.pending)return;state.pending=true;try{const q=new URLSearchParams({demo:state.demo?'1':'0',history:state.history?'1':'0'});const response=await fetch('/api/status?'+q,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('server error');const data=await response.json();if(token!==generation)return;state.farms=data.farms;$('connection').textContent=state.demo?'Demo world · fictional activity':'Connected to this PC';$('connection-dot').className='good';$('notice').hidden=!state.demo;$('notice').textContent=state.demo?'You’re exploring a fictional farm. Switch to Live farm to see Codex activity from this PC.':'';$('updated').textContent='Last checked '+new Date(data.updated_at*1000).toLocaleTimeString();const signature=JSON.stringify([data.farms.map(f=>({...f,title:undefined})),state.filter,state.search,state.history,state.demo]);if(signature!==state.signature){state.signature=signature;render();}}catch(error){if(token!==generation)return;$('connection').textContent='Local server unavailable';$('connection-dot').className='bad';$('notice').hidden=false;$('notice').textContent='Cannot reach the local server. Keep python3 web_server.py running on this PC. Displayed activity may be out of date.';}finally{state.pending=false;if(token!==generation)refresh();}}
function mode(demo){state.demo=demo;state.selected=null;state.signature='';generation++;$('notice').hidden=false;$('notice').textContent='Loading '+(demo?'the demo world…':'local activity…');refresh();}
$('live').onclick=()=>mode(false);$('demo').onclick=()=>mode(true);$('empty-demo').onclick=()=>mode(true);
$('history').onclick=()=>{state.history=true;state.selected=null;state.signature='';generation++;refresh();};$('overview').onclick=()=>{state.history=false;state.selected=null;state.signature='';generation++;refresh();};
$('search').oninput=e=>{state.search=e.target.value;render();};$('filter').onchange=e=>{state.filter=e.target.value;render();};
let lastFrame=0;function animate(t){if(t-lastFrame>180){for(const canvas of document.querySelectorAll('canvas.scene'))scene(canvas,canvas.farm,canvas.farmIndex,reduced?0:t);lastFrame=t;}requestAnimationFrame(animate);}requestAnimationFrame(animate);refresh();setInterval(refresh,2000);

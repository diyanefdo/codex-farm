'use strict';
const $ = id => document.getElementById(id);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionPreference.matches;
const state = {demo:false, history:false, farms:[], selected:null, selectedWorker:null, zoom:1, autoZoom:true, motion:!reduced, order:[], deskOrder:new Map(), layout:null, filter:'all', search:'', pending:false, signature:'', receivedStatus:false};
const palette = ['#388cc5','#e2765d','#9670ca','#e4ad3c','#39a58a','#cc70a0'];
const roomThemes = [
 {wall:'#a66c3d',floor:'#f3d9a3',plank:'#dfba7f',header:'#ffe5a5',trim:'#d8a557',rug:'#82bd8d',rugLight:'#b5db9b'},
 {wall:'#8071a7',floor:'#e8def2',plank:'#cfbde2',header:'#ded0f5',trim:'#ac94d0',rug:'#b79bd8',rugLight:'#dac6ed'},
 {wall:'#488b83',floor:'#deedc9',plank:'#b5d5ad',header:'#bde5d9',trim:'#7bbba5',rug:'#7ac4c5',rugLight:'#bae1d7'},
 {wall:'#b87683',floor:'#f6e0ce',plank:'#e5b9ab',header:'#ffd1db',trim:'#d998a3',rug:'#df9caf',rugLight:'#f1c7d2'},
 {wall:'#578ba8',floor:'#e1e9de',plank:'#bed1c9',header:'#bce2f2',trim:'#8abed3',rug:'#81badd',rugLight:'#badced'},
 {wall:'#ae7653',floor:'#f5dfba',plank:'#dfbc91',header:'#ffd4af',trim:'#dcac78',rug:'#e4b36f',rugLight:'#f4d393'}
];
function themeIndex(id){let hash=0;for(const char of String(id))hash=(hash*31+char.charCodeAt(0))>>>0;return hash%roomThemes.length;}
function taskPreview(worker){const text=String(worker.task||worker.goal||'Waiting for a task').replace(/\s+/g,' ').trim();return text.length>100?text.slice(0,97).trimEnd()+'…':text;}
function taskPreviewLabel(worker){return worker.state==='working'?'Working on':worker.state==='done'?'Last worked on':worker.state==='paused'?'Paused on':worker.state==='delegated'?'Assigned':'Last task';}
function el(tag, cls, text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
function person(c,x,y,color,frame=0,manager=false,pose=null){
  const step=pose?pose.step:frame%2,left=pose?pose.armLeft:0,right=pose?pose.armRight:0;
  rect(c,x-5,y+13,14,3,'#5d793c55');
  rect(c,x-1,y+7,3,7+step,'#4e4a3d');rect(c,x+4,y+7,3,8-step,'#4e4a3d');
  rect(c,x-3,y,12,9,color);
  rect(c,x-5,y+1+left,3,6,'#e8b684');rect(c,x+9,y+1+right,3,6,'#e8b684');
  rect(c,x-1,y-7,8,8,'#efc08b');rect(c,x-2,y-9,10,4,'#71523e');rect(c,x+(pose&&pose.facing===-1?0:5),y-4,1,2,'#473f37');
  rect(c,x-4,y-9,14,3,manager?'#b37343':'#d5b877');rect(c,x-1,y-13,8,5,manager?'#ae6437':'#e0c583');
}
function tree(c,x,y,variant=0){rect(c,x-3,y,7,24,'#83683f');rect(c,x-14,y-10,30,15,'#2b8857');rect(c,x-20,y-24,41,20,'#429d5c');rect(c,x-14,y-35,28,17,'#6bb960');rect(c,x-7,y-41,15,13,'#93d575');rect(c,x-17,y-19,8,7,'#81ca65');rect(c,x+8,y-7,10,7,'#3f714a');if(variant){rect(c,x+10,y-22,3,4,'#f4816d');rect(c,x-7,y-28,4,4,'#ffbb5e');}}
function fence(c,x,y,w){rect(c,x,y+3,w,3,'#e6d4a0');rect(c,x,y+11,w,3,'#d6bc86');for(let n=0;n<w;n+=18){rect(c,x+n,y,4,20,'#f1dca8');rect(c,x+n+3,y+2,2,18,'#bba16c');}}
function scene(canvas, layout, farms, tick){
 const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 const W=layout.width,H=layout.height;
 rect(c,0,0,W,H,'#83c76a');
 for(let y=0;y<H;y+=13)for(let x=0;x<W;x+=17){
   const seed=(x*13+y*29)%97;
   rect(c,x+seed%9,y+seed%7,2,2,seed%5?'#71b95e':'#a4db7d');
   if(seed<8){const petal=['#ffce5c','#e791ca','#b3a1f0','#fff2bd'][seed%4];rect(c,x+4,y+3,2,2,petal);rect(c,x+3,y+5,4,2,petal);rect(c,x+4,y+5,2,2,'#fff0a0');}
 }
 // Every office opens onto the same continuous village lane.
 rect(c,358,0,44,H,'#d8b877');rect(c,362,0,36,H,'#f0d49a');
 for(let y=7;y<H;y+=21){rect(c,366+(y%11),y,5,2,'#c6af85');rect(c,390,y+9,4,2,'#c6af85');}
 for(let i=0;i<layout.offices.length;i+=2){
   const pair=layout.offices.slice(i,i+2),bottom=Math.max(...pair.map(o=>o.y+o.height));
   rect(c,25,bottom+8,710,20,'#ebc98b');
 }
 for(let y=70;y<H;y+=156){tree(c,16,y,1);tree(c,744,y+45);}
 fence(c,25,16,260);fence(c,475,16,260);
 const byId=new Map(farms.map(f=>[f.id,f]));
 for(const office of layout.offices){
   const farm=byId.get(office.farmId);if(!farm)continue;
   const {x,y,width:w,height:h}=office,theme=roomThemes[themeIndex(farm.id)];
   rect(c,x+4,y+5,w,h,'#3f795455');rect(c,x,y,w,h,theme.wall);rect(c,x+5,y+5,w-10,h-10,theme.floor);
   // A cutaway office: timber floor, thick walls, green rug and an open door.
   for(let row=y+8;row<y+h-7;row+=12){rect(c,x+6,row,w-12,1,theme.plank);for(let col=x+12+(row%3)*13;col<x+w-8;col+=58)rect(c,col,row,1,12,theme.plank);}
   rect(c,x+8,y+8,w-16,28,theme.header);rect(c,x+8,y+35,w-16,2,theme.trim);
   rect(c,x+w/2-17,y+h-5,34,9,'#ebc98b');
   // Window and bookshelf, beside the manager's desk.
   rect(c,x+24,y+52,34,30,'#8d7659');rect(c,x+27,y+55,28,24,'#adced0');rect(c,x+39,y+54,3,26,'#f0dfb4');rect(c,x+27,y+66,28,2,'#f0dfb4');
   rect(c,x+w-66,y+52,42,30,'#92754e');
   for(let b=0;b<6;b++)rect(c,x+w-62+b*6,y+57+(b%2)*3,4,17-(b%2)*3,palette[b]);
   rect(c,x+w-66,y+78,42,3,'#725c3e');
   for(const plantX of [x+16,x+w-26]){rect(c,plantX,y+h-25,10,12,'#b9815c');rect(c,plantX-3,y+h-35,16,12,'#7e9b5c');rect(c,plantX+2,y+h-40,7,12,'#98af70');}
   for(const desk of office.desks){
     const worker=farm.workers[desk.index],dx=desk.x,dy=desk.y;
     rect(c,dx+3,dy+5,desk.width-6,desk.height-8,theme.rug);
     rect(c,dx+5,dy+7,desk.width-10,desk.height-12,theme.rugLight);
     rect(c,dx+5,dy+7,desk.width-10,2,theme.header);
     const moving=state.motion&&!reduced;
     const pose=workerMotion(worker,tick,desk.index+layout.offices.indexOf(office)*3,moving);
     const pacing=pose.activity==='pacing',px=dx+36+pose.x,py=dy+(pacing?38:24)+pose.y;
     rect(c,dx+28,dy+33,19,10,'#876d4b');
     if(!pacing)person(c,px,py,palette[desk.index%palette.length],pose.step,desk.manager,pose);
     // Work surfaces stay fixed while the person types, stretches or paces.
     rect(c,dx+13,dy+38,54,12,'#99764e');rect(c,dx+13,dy+36,54,10,'#c09860');
     rect(c,dx+17,dy+38,11,6,'#f6e6bb');rect(c,dx+49,dy+33,12,9,'#65766a');
     rect(c,dx+51,dy+35,8,5,worker.state==='working'?'#b9d595':'#9cafa1');rect(c,dx+54,dy+42,3,3,'#65766a');
     if(pacing)person(c,px,py,palette[desk.index%palette.length],pose.step,desk.manager,pose);
     if(worker.state==='working'){
       if(pose.activity==='typing'){
         rect(c,px-4,dy+37+pose.armLeft,3,3,'#efc08b');rect(c,px+9,dy+37+pose.armRight,3,3,'#efc08b');
         rect(c,dx+52,dy+36,4,1,'#e1efb7');
       }
       const bob=moving?pose.y:0;
       rect(c,dx+44,dy+1+bob,10,8,'#fff7d8');rect(c,dx+46,dy+9+bob,2,2,'#fff7d8');
       rect(c,dx+47,dy+3+bob,moving?2+pose.step*2:3,3,'#8aa45d');
     }
   }
 }
}
function avatar(index){const canvas=el('canvas','avatar');canvas.width=28;canvas.height=32;const c=canvas.getContext('2d');person(c,10,14,palette[index%palette.length],0,index===0);return canvas;}
function working(f){return f.workers.some(w=>w.state==='working');}
function label(f){return f.source==='demo'?'FICTIONAL DEMO':f.source==='session'?'RECORDED SESSION · PID UNVERIFIED':f.linked?'LINKED TERMINAL':'PROCESS · SESSION UNLINKED';}
function view(){let farms=state.farms.filter(f=>state.filter==='all'||(state.filter==='working'?working(f):!working(f)));const q=state.search.toLowerCase();if(q)farms=farms.filter(f=>[f.name,f.directory,...f.workers.map(w=>w.name+' '+w.task+' '+w.goal)].join(' ').toLowerCase().includes(q));return farms;}
function applyZoom(){
 const layout=state.layout;if(!layout)return;
 const viewport=$('world-viewport'),vw=viewport.clientWidth||800,vh=viewport.clientHeight||600;
 if(state.autoZoom)state.zoom=Math.max(vw<=600?1:.5,Math.min(2,(vw-64)/layout.width));
 const width=layout.width*state.zoom,height=layout.height*state.zoom;
 const topPadding=vw<=850?140:92,bottomPadding=100;
 $('world-space').style.transform=`scale(${state.zoom})`;
 // Meadow fills the screen even when a small team occupies only one office.
 $('world-space').style.left=Math.max(0,(vw-width)/2)+'px';
 $('world-space').style.top=(topPadding+Math.max(0,(vh-topPadding-bottomPadding-height)/2))+'px';
 $('world-sizer').style.width=Math.max(vw,width)+'px';
 $('world-sizer').style.height=Math.max(vh,topPadding+height+bottomPadding)+'px';
 $('zoom-label').textContent=Math.round(state.zoom*100)+'%';
 $('zoom-out').disabled=state.zoom<=.25;$('zoom-in').disabled=state.zoom>=2;
}
function updateMotionControl(){
 const toggle=$('motion-toggle');
 toggle.textContent=reduced?'Reduced motion':state.motion?'Motion on':'Motion off';
 toggle.setAttribute('aria-pressed',String(state.motion&&!reduced));
 toggle.disabled=reduced;
 toggle.title=reduced?'Your system preference disables animation':'Toggle working-character movement';
}
function render(){
 const all=state.farms,workers=all.flatMap(f=>f.workers),farms=view();
 $('farm-count').textContent=all.length;$('agent-count').textContent=all.reduce((n,f)=>n+Math.max(0,f.workers.length-1),0);$('working-count').textContent=workers.filter(w=>w.state==='working').length;$('done-count').textContent=workers.filter(w=>['idle','done','paused'].includes(w.state)).length;
 $('farm-caption').textContent=state.history?'Recorded teams from the last 24 hours':'One office per manager · desks grow as agents join';
 $('section-title').textContent=state.history?'The shared homestead · journal':'The shared homestead';
 const focusedKey=document.activeElement?.dataset?.deskKey;
 const world=$('world-space');world.replaceChildren();
 const layout=layoutOffices(farms);state.layout=layout;
 world.style.width=layout.width+'px';world.style.height=layout.height+'px';
 const canvas=el('canvas','world-scene');canvas.width=layout.width;canvas.height=layout.height;canvas.setAttribute('aria-hidden','true');canvas.worldLayout=layout;canvas.worldFarms=farms;world.append(canvas);
 const byId=new Map(farms.map(f=>[f.id,f]));
 for(const office of layout.offices){
   const farm=byId.get(office.farmId),room=el('section','office'+(farm.id===state.selected?' selected':''));
   room.style.left=office.x+'px';room.style.top=office.y+'px';room.style.width=office.width+'px';room.style.height=office.height+'px';room.setAttribute('aria-label',farm.name+' office, '+farm.workers.length+' desks');room.dataset.theme=String(themeIndex(farm.id));
   const agentCount=Math.max(0,farm.workers.length-1);
   const heading=el('button','office-title',farm.name+' · '+agentCount+(agentCount===1?' agent':' agents'));heading.title=farm.title+' — '+label(farm);heading.onclick=()=>select(farm.id);room.append(heading);
   for(const desk of office.desks){
     const worker=farm.workers[desk.index],isSelected=state.selected===farm.id&&state.selectedWorker===worker.id;
     const button=el('button','desk-button status-'+worker.state+(desk.manager?' manager':'')+(isSelected?' selected':''));
     button.style.left=(desk.x-office.x)+'px';button.style.top=(desk.y-office.y)+'px';button.style.width=desk.width+'px';button.style.height=desk.height+'px';
     button.dataset.deskKey=JSON.stringify([farm.id,worker.id]);button.setAttribute('aria-pressed',String(isSelected));
     const name=desk.manager?'Manager':worker.name;
     button.setAttribute('aria-label',name+' in '+farm.name+', '+worker.state+'. '+worker.task);button.title=name+' · '+worker.state+'\n'+worker.task;
     const caption=el('span','desk-caption');caption.append(el('i','state-dot '+worker.state),el('span','',name));
     const preview=el('span','desk-preview');preview.append(el('span','desk-preview-label',taskPreviewLabel(worker)),el('span','desk-preview-text',taskPreview(worker)));
     button.append(caption,preview);
     button.onclick=()=>select(farm.id,worker.id);room.append(button);
   }
   world.append(room);
 }
 scene(canvas,layout,farms,0);applyZoom();updateMotionControl();
 if(focusedKey){const target=[...world.querySelectorAll('button[data-desk-key]')].find(e=>e.dataset.deskKey===focusedKey);if(target)target.focus({preventScroll:true});}
 $('farms').hidden=false;$('empty').hidden=farms.length>0;
 $('empty-text').textContent=state.search||state.filter!=='all'?'No offices match those filters. Try another search or choose All activity.':state.history?'No compatible session logs found in the last 24 hours. Check the Codex log folder used by the local server.':'Start Codex in another terminal on this PC. Each detected manager gets an office here. Try Session history for older teams.';
 $('overview').classList.toggle('active',!state.history);$('history').classList.toggle('active',state.history);$('live').classList.toggle('selected',!state.demo);$('demo').classList.toggle('selected',state.demo);
 details();
}
function select(id,workerId=null){state.selected=id;state.selectedWorker=workerId;render();}
function details(){
 const panel=$('inspector'),farm=state.farms.find(f=>f.id===state.selected);panel.hidden=!farm;if(!farm)return;
 panel.replaceChildren();const close=el('button','close','×');close.setAttribute('aria-label','Close desk details');close.onclick=()=>{state.selected=null;state.selectedWorker=null;render();};
 const selected=farm.workers.find(w=>w.id===state.selectedWorker);
 panel.append(close,el('span','eyebrow',selected?'AT THIS DESK':'INSIDE THE OFFICE'),el('h2','',farm.name),el('p','tiny',label(farm)),el('h4','','PROJECT FOLDER'),el('p','',farm.directory));
 if(selected){const back=el('button','office-back','← See the whole team');back.onclick=()=>select(farm.id);panel.append(back);}
 const team=selected?[selected]:farm.workers;
 team.forEach(w=>{const i=farm.workers.indexOf(w),block=el('div','detail-worker');block.append(avatar(i),el('h4','',(i===0?'MANAGER':w.name.toUpperCase())+' · '+w.state.toUpperCase()),el('p','',w.task));if(w.goal&&w.goal!==w.task)block.append(el('p','tiny','ORIGINAL REQUEST'),el('p','',w.goal));const ids=el('details');ids.append(el('summary','','Session identifier'),el('code','',w.id));block.append(ids);panel.append(block);});
 if(farm.workers.length===1)panel.append(el('p','tiny','No agents recorded yet. Their desks appear here when Codex confirms delegation.'));
 if(farm.observed_at)panel.append(el('p','tiny','Log modified '+new Date(farm.observed_at*1000).toLocaleString()));
 panel.append(el('p','tiny','Status reflects recorded events. A quiet log may still show the last task.'));
}
let generation=0;
async function refresh(){
 const token=generation;if(state.pending)return;state.pending=true;
 let phase='request',httpStatus=null,serverMessage='';
 try{
   const q=new URLSearchParams({demo:state.demo?'1':'0',history:state.history?'1':'0'});
   const response=await fetch('/api/status?'+q,{signal:AbortSignal.timeout(state.demo||state.receivedStatus?8000:30000)});
   httpStatus=response.status;
   if(!response.ok){
     const text=await response.text();
     try{const detail=JSON.parse(text);serverMessage=String(detail.error||'')+(detail.error_type?' ('+detail.error_type+')':'');}catch{serverMessage=text;}
     throw Error('HTTP status failure');
   }
   phase='decode';
   const data=await response.json();if(token!==generation)return;
   if(!data||!Array.isArray(data.farms))throw Error('Expected a farms list from /api/status');
   if(!state.demo)state.receivedStatus=true;phase='render';
   for(const farm of data.farms){
     if(!state.order.includes(farm.id))state.order.push(farm.id);
     const order=state.deskOrder.get(farm.id)||[];
     for(const worker of farm.workers.slice(1))if(!order.includes(worker.id))order.push(worker.id);
     state.deskOrder.set(farm.id,order);
     // Keep the manager first and give newly observed agents the next desk.
     farm.workers=[...farm.workers.slice(0,1),...farm.workers.slice(1).sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id))];
   }
   state.farms=data.farms.sort((a,b)=>state.order.indexOf(a.id)-state.order.indexOf(b.id));
   $('connection').textContent=state.demo?'Demo world · fictional activity':'Connected to local server';
   $('connection-dot').className='good';$('notice').hidden=!state.demo;
   $('notice').textContent=state.demo?'You’re exploring a fictional world. Switch to Live farm to see activity from your connected Linux machine.':'';
   $('updated').textContent='Last checked '+new Date(data.updated_at*1000).toLocaleTimeString();
   const signature=JSON.stringify([state.farms.map(f=>({...f,title:undefined})),state.filter,state.search,state.history,state.demo]);
   if(signature!==state.signature){render();state.signature=signature;}
 }catch(error){
   if(token!==generation)return;
   $('connection-dot').className='bad';$('notice').hidden=false;
   if(phase==='render'){
     $('connection').textContent='Connected · scene error';
     $('notice').textContent='The server returned activity, but the farm could not be drawn: '+error.name+': '+error.message+'. Refresh after updating and restarting the Linux server.';
   }else if(phase==='decode'){
     $('connection').textContent='Connected · invalid status data';
     $('notice').textContent='The server replied, but /api/status did not contain the expected JSON data. Open /api/status in this browser and share the response.';
   }else if(httpStatus!==null){
     $('connection').textContent='Status request failed · HTTP '+httpStatus;
     const advice=httpStatus===403?'Update and restart the Linux server, then open its localhost URL through your SSH tunnel.':'Check the Linux server terminal.';
     $('notice').textContent='Status request failed (HTTP '+httpStatus+'). '+serverMessage.slice(0,220)+' '+advice;
   }else if(error.name==='TimeoutError'||error.name==='AbortError'){
     $('connection').textContent='Waiting for session scan';
     $('notice').textContent='The status request timed out. The first scan of large session logs can take longer; the dashboard will retry. If this persists, open /api/status in this browser and check the Linux terminal.';
   }else{
     $('connection').textContent='Local server unavailable';
     $('notice').textContent='The status connection failed ('+error.name+': '+error.message+'). Keep python3 web_server.py and your SSH tunnel running. Try opening /api/status in this browser.';
   }
 }finally{state.pending=false;if(token!==generation)refresh();}
}
function mode(demo){state.demo=demo;state.selected=null;state.selectedWorker=null;state.signature='';generation++;$('notice').hidden=false;$('notice').textContent='Loading '+(demo?'the demo world…':'local activity…');refresh();}
$('live').onclick=()=>mode(false);$('demo').onclick=()=>mode(true);$('empty-demo').onclick=()=>mode(true);
$('history').onclick=()=>{state.history=true;state.selected=null;state.selectedWorker=null;state.signature='';generation++;refresh();};$('overview').onclick=()=>{state.history=false;state.selected=null;state.selectedWorker=null;state.signature='';generation++;refresh();};
$('search').oninput=e=>{state.search=e.target.value;render();};$('filter').onchange=e=>{state.filter=e.target.value;render();};
$('zoom-in').onclick=()=>{state.autoZoom=false;state.zoom=Math.min(2,state.zoom+.25);applyZoom();};
$('zoom-out').onclick=()=>{state.autoZoom=false;state.zoom=Math.max(.25,state.zoom-.25);applyZoom();};
$('zoom-fit').onclick=()=>{if(state.layout){state.autoZoom=false;const viewport=$('world-viewport');state.zoom=Math.max(.25,Math.min(2,(viewport.clientWidth-18)/state.layout.width,((viewport.clientHeight||600)-(viewport.clientWidth<=850?240:192))/state.layout.height));applyZoom();}};
$('motion-toggle').onclick=()=>{if(!reduced){state.motion=!state.motion;updateMotionControl();const canvas=document.querySelector('canvas.world-scene');if(canvas)scene(canvas,canvas.worldLayout,canvas.worldFarms,0);}};
if(typeof addEventListener==='function')addEventListener('resize',()=>applyZoom());
if(typeof motionPreference.addEventListener==='function')motionPreference.addEventListener('change',event=>{reduced=event.matches;updateMotionControl();const canvas=document.querySelector('canvas.world-scene');if(canvas)scene(canvas,canvas.worldLayout,canvas.worldFarms,0);});
let lastFrame=0;function animate(t){if(!document.hidden&&t-lastFrame>75){const canvas=document.querySelector('canvas.world-scene');if(canvas&&state.motion&&!reduced)scene(canvas,canvas.worldLayout,canvas.worldFarms,t);lastFrame=t;}requestAnimationFrame(animate);}
requestAnimationFrame(animate);refresh();setInterval(refresh,2000);

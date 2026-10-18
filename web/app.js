'use strict';
const $ = id => document.getElementById(id);
const state = {demo:false, history:false, farms:[], selected:null, selectedWorker:null, zoom:1, order:[], deskOrder:new Map(), layout:null, filter:'all', search:'', pending:false, signature:''};
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
function scene(canvas, layout, farms, tick){
 const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 const W=layout.width,H=layout.height;
 rect(c,0,0,W,H,'#accb86');
 for(let y=0;y<H;y+=13)for(let x=0;x<W;x+=17){
   const seed=(x*13+y*29)%97;
   rect(c,x+seed%9,y+seed%7,2,2,seed%5?'#9fbe79':'#c1d99a');
   if(seed<5){rect(c,x+4,y+3,2,2,'#f5dfa1');rect(c,x+3,y+5,4,2,'#c5db94');}
 }
 // Every office opens onto the same continuous village lane.
 rect(c,358,0,44,H,'#d2bf93');rect(c,362,0,36,H,'#e0cca0');
 for(let y=7;y<H;y+=21){rect(c,366+(y%11),y,5,2,'#c6af85');rect(c,390,y+9,4,2,'#c6af85');}
 for(let i=0;i<layout.offices.length;i+=2){
   const pair=layout.offices.slice(i,i+2),bottom=Math.max(...pair.map(o=>o.y+o.height));
   rect(c,25,bottom+8,710,20,'#d8c69b');
 }
 for(let y=70;y<H;y+=156){tree(c,16,y,1);tree(c,744,y+45);}
 fence(c,25,16,260);fence(c,475,16,260);
 const byId=new Map(farms.map(f=>[f.id,f]));
 for(const office of layout.offices){
   const farm=byId.get(office.farmId);if(!farm)continue;
   const {x,y,width:w,height:h}=office;
   rect(c,x+4,y+5,w,h,'#6b824d55');rect(c,x,y,w,h,'#806746');rect(c,x+5,y+5,w-10,h-10,'#e1cda0');
   // A cutaway office: timber floor, thick walls, green rug and an open door.
   for(let row=y+8;row<y+h-7;row+=12){rect(c,x+6,row,w-12,1,'#cdb98b');for(let col=x+12+(row%3)*13;col<x+w-8;col+=58)rect(c,col,row,1,12,'#d4bf91');}
   rect(c,x+8,y+8,w-16,28,'#f2e2bb');rect(c,x+8,y+35,w-16,2,'#baa17b');
   rect(c,x+w/2-17,y+h-5,34,9,'#d8c69b');
   // Window and bookshelf, beside the manager's desk.
   rect(c,x+24,y+52,34,30,'#8d7659');rect(c,x+27,y+55,28,24,'#adced0');rect(c,x+39,y+54,3,26,'#f0dfb4');rect(c,x+27,y+66,28,2,'#f0dfb4');
   rect(c,x+w-66,y+52,42,30,'#92754e');
   for(let b=0;b<6;b++)rect(c,x+w-62+b*6,y+57+(b%2)*3,4,17-(b%2)*3,palette[b]);
   rect(c,x+w-66,y+78,42,3,'#725c3e');
   for(const plantX of [x+16,x+w-26]){rect(c,plantX,y+h-25,10,12,'#b9815c');rect(c,plantX-3,y+h-35,16,12,'#7e9b5c');rect(c,plantX+2,y+h-40,7,12,'#98af70');}
   for(const desk of office.desks){
     const worker=farm.workers[desk.index],dx=desk.x,dy=desk.y;
     rect(c,dx+3,dy+5,desk.width-6,desk.height-8,desk.manager?'#b8bd87':'#c4c59b');
     rect(c,dx+5,dy+7,desk.width-10,desk.height-12,desk.manager?'#ced09b':'#d5d3ad');
     const frame=worker.state==='working'?Math.floor(tick/550):0;
     person(c,dx+36,dy+24,palette[desk.index%palette.length],frame,desk.manager);
     // Chair, broad desktop, paperwork, and a little monitor.
     rect(c,dx+28,dy+33,19,10,'#876d4b');rect(c,dx+13,dy+38,54,12,'#99764e');rect(c,dx+13,dy+36,54,10,'#c09860');
     rect(c,dx+17,dy+38,11,6,'#f6e6bb');rect(c,dx+49,dy+33,12,9,'#65766a');rect(c,dx+51,dy+35,8,5,worker.state==='working'?'#b9d595':'#9cafa1');rect(c,dx+54,dy+42,3,3,'#65766a');
     if(worker.state==='working'){rect(c,dx+44,dy+2,10,8,'#fff7d8');rect(c,dx+46,dy+10,2,2,'#fff7d8');rect(c,dx+47,dy+4,2+(frame%2)*2,3,'#8aa45d');}
   }
 }
}
function avatar(index){const canvas=el('canvas','avatar');canvas.width=28;canvas.height=32;const c=canvas.getContext('2d');person(c,10,14,palette[index%palette.length],0,index===0);return canvas;}
function working(f){return f.workers.some(w=>w.state==='working');}
function label(f){return f.source==='demo'?'FICTIONAL DEMO':f.source==='session'?'RECORDED SESSION · PID UNVERIFIED':f.linked?'LINKED TERMINAL':'PROCESS · SESSION UNLINKED';}
function view(){let farms=state.farms.filter(f=>state.filter==='all'||(state.filter==='working'?working(f):!working(f)));const q=state.search.toLowerCase();if(q)farms=farms.filter(f=>[f.name,f.directory,...f.workers.map(w=>w.name+' '+w.task+' '+w.goal)].join(' ').toLowerCase().includes(q));return farms;}
function applyZoom(){
 const layout=state.layout;if(!layout)return;
 $('world-space').style.transform=`scale(${state.zoom})`;
 $('world-sizer').style.width=layout.width*state.zoom+'px';
 $('world-sizer').style.height=layout.height*state.zoom+'px';
 $('zoom-label').textContent=Math.round(state.zoom*100)+'%';
 $('zoom-out').disabled=state.zoom<=.25;$('zoom-in').disabled=state.zoom>=2;
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
   room.style.left=office.x+'px';room.style.top=office.y+'px';room.style.width=office.width+'px';room.style.height=office.height+'px';room.setAttribute('aria-label',farm.name+' office, '+farm.workers.length+' desks');
   const heading=el('button','office-title',farm.name+' · '+Math.max(0,farm.workers.length-1)+' agents');heading.title=farm.title+' — '+label(farm);heading.onclick=()=>select(farm.id);room.append(heading);
   for(const desk of office.desks){
     const worker=farm.workers[desk.index],isSelected=state.selected===farm.id&&state.selectedWorker===worker.id;
     const button=el('button','desk-button'+(desk.manager?' manager':'')+(isSelected?' selected':''));
     button.style.left=(desk.x-office.x)+'px';button.style.top=(desk.y-office.y)+'px';button.style.width=desk.width+'px';button.style.height=desk.height+'px';
     button.dataset.deskKey=JSON.stringify([farm.id,worker.id]);button.setAttribute('aria-pressed',String(isSelected));
     const name=desk.manager?'Manager':worker.name;
     button.setAttribute('aria-label',name+' in '+farm.name+', '+worker.state+'. '+worker.task);button.title=name+' · '+worker.state+'\n'+worker.task;
     const caption=el('span','desk-caption');caption.append(el('i','state-dot '+worker.state),el('span','',name));button.append(caption);
     button.onclick=()=>select(farm.id,worker.id);room.append(button);
   }
   world.append(room);
 }
 scene(canvas,layout,farms,0);applyZoom();
 if(focusedKey){const target=[...world.querySelectorAll('button[data-desk-key]')].find(e=>e.dataset.deskKey===focusedKey);if(target)target.focus({preventScroll:true});}
 $('farms').hidden=farms.length===0;$('empty').hidden=farms.length>0;
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
 try{
   const q=new URLSearchParams({demo:state.demo?'1':'0',history:state.history?'1':'0'});
   const response=await fetch('/api/status?'+q,{signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('server error');
   const data=await response.json();if(token!==generation)return;
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
   if(signature!==state.signature){state.signature=signature;render();}
 }catch(error){
   if(token!==generation)return;
   $('connection').textContent='Local server unavailable';$('connection-dot').className='bad';$('notice').hidden=false;
   $('notice').textContent='Cannot reach the server. Keep python3 web_server.py and your SSH tunnel, if used, running. Displayed activity may be out of date.';
 }finally{state.pending=false;if(token!==generation)refresh();}
}
function mode(demo){state.demo=demo;state.selected=null;state.selectedWorker=null;state.signature='';generation++;$('notice').hidden=false;$('notice').textContent='Loading '+(demo?'the demo world…':'local activity…');refresh();}
$('live').onclick=()=>mode(false);$('demo').onclick=()=>mode(true);$('empty-demo').onclick=()=>mode(true);
$('history').onclick=()=>{state.history=true;state.selected=null;state.selectedWorker=null;state.signature='';generation++;refresh();};$('overview').onclick=()=>{state.history=false;state.selected=null;state.selectedWorker=null;state.signature='';generation++;refresh();};
$('search').oninput=e=>{state.search=e.target.value;render();};$('filter').onchange=e=>{state.filter=e.target.value;render();};
$('zoom-in').onclick=()=>{state.zoom=Math.min(2,state.zoom+.25);applyZoom();};
$('zoom-out').onclick=()=>{state.zoom=Math.max(.25,state.zoom-.25);applyZoom();};
$('zoom-fit').onclick=()=>{if(state.layout){state.zoom=Math.max(.25,Math.min(2,($('world-viewport').clientWidth-18)/state.layout.width));applyZoom();}};
let lastFrame=0;function animate(t){if(!document.hidden&&t-lastFrame>180){const canvas=document.querySelector('canvas.world-scene');if(canvas)scene(canvas,canvas.worldLayout,canvas.worldFarms,reduced?0:t);lastFrame=t;}requestAnimationFrame(animate);}
requestAnimationFrame(animate);refresh();setInterval(refresh,2000);

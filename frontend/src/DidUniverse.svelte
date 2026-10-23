<script>
 import {onMount} from 'svelte';
 let {operators=[], pending=0, freshness='', onOperator=()=>{}}=$props();
 let canvas; let angle=$state(-0.68), elevation=$state(0.66), zoom=$state(1), picked=$state(''), hovered=$state('');
 let dragging=false, lastX=0,lastY=0, moved=false, raf=0, targets=[];
 const palette=['#f97316','#3b82f6','#14b8a6','#8b5cf6','#eab308','#ec4899','#22c55e','#64748b'];
 let rows=$derived(operators.slice(0,16));
 let chosen=$derived(rows.find(r=>r.operator===picked));
 function color(hex,a=1){let n=parseInt(hex.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`}
 function paint(){
  if(!canvas)return;
  const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;
  if(!w||!h)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#f8fbff';ctx.fillRect(0,0,w,h);
  let sc=Math.min(w/840,h/520)*zoom;
  const project=(x,y,z=0)=>{
   const ca=Math.cos(angle),sa=Math.sin(angle),ce=Math.cos(elevation),se=Math.sin(elevation);
   let rx=x*ca-z*sa,rz=x*sa+z*ca;
   return [w/2+rx*sc,h*.55+(rz*se-y*ce)*sc];
  };
  function poly(points,fill,stroke='#dce4ed'){
   ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}
  }
  // Architectural plinth: an abstract operations campus, not a physical office layout.
  const corners=[[-330,-180],[330,-180],[330,180],[-330,180]];
  poly(corners.map(([x,z])=>project(x,-15,z)),'#e8eef6');
  poly([project(-330,-15,180),project(330,-15,180),project(330,-32,180),project(-330,-32,180)],'#cdd8e5');
  const count=Math.max(rows.length,1);
  const nodes=rows.map((r,i)=>{
   const theta=i/count*Math.PI*2;
   const radius=count<5?185:235;
   return {r,i,x:Math.cos(theta)*radius,z:Math.sin(theta)*radius,theta};
  });
  // Render back-to-front for correct overlap.
  targets=[];
  nodes.sort((a,b)=>project(a.x,0,a.z)[1]-project(b.x,0,b.z)[1]).forEach(n=>{
   const {r,i,x,z}=n;
   const base=Math.max(12,Math.min(90,18+Math.sqrt(Math.max(0,r.total))*2.3));
   const top=base*1.4;
   const width=30;
   const p=project(x,0,z),t=project(x,top,z);
   const a=project(x-width,0,z-width),b=project(x+width,0,z-width),c=project(x+width,0,z+width),d=project(x-width,0,z+width);
   const aa=project(x-width,top,z-width),bb=project(x+width,top,z-width),cc=project(x+width,top,z+width),dd=project(x-width,top,z+width);
   const shade=palette[i%palette.length],selected=picked===r.operator;
   poly([a,b,bb,aa],color(shade,.40));
   poly([b,c,cc,bb],color(shade,.75));
   poly([c,d,dd,cc],color(shade,.55));
   poly([d,a,aa,dd],color(shade,.5));
   poly([aa,bb,cc,dd],color(shade,.95),'#fff');
   const assignedRatio=r.assigned/Math.max(1,r.total),availableRatio=r.available/Math.max(1,r.total);
   // Capacity bars are derived from actual snapshot counts.
   const bw=7,bh=55,barX=t[0]+22,barY=t[1]+5;
   ctx.fillStyle='#e4e9f1';ctx.fillRect(barX,barY,bw,bh);
   ctx.fillStyle='#f97316';ctx.fillRect(barX,barY+bh*(1-assignedRatio),bw,bh*assignedRatio);
   ctx.fillStyle='#3b82f6';ctx.fillRect(barX+10,barY+bh*(1-availableRatio),bw,bh*availableRatio);
   if(selected){ctx.strokeStyle='#ff6b00';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(p[0],p[1],48*sc,21*sc,0,0,Math.PI*2);ctx.stroke()}
   ctx.fillStyle='#fff';ctx.strokeStyle='#d8e0e9';ctx.lineWidth=1;
   const label=String(r.operator).replace(/^opensips-/i,'');
   ctx.font=`600 ${Math.max(10,Math.min(13,12*sc))}px system-ui`;
   const tw=Math.min(ctx.measureText(label).width+18,160);
   const lx=t[0]-tw/2,ly=t[1]-29;
   ctx.beginPath();ctx.roundRect(lx,ly,tw,23,6);ctx.fill();ctx.stroke();
   ctx.fillStyle='#263447';ctx.textAlign='center';ctx.fillText(label.length>21?label.slice(0,19)+'…':label,t[0],ly+15,tw-10);
   ctx.font=`700 ${Math.max(10,Math.min(13,12*sc))}px system-ui`;ctx.fillStyle=shade;ctx.fillText(String(r.total),t[0],t[1]-38);
   targets.push({x:t[0],y:t[1]-10,rad:Math.max(32,42*sc),name:r.operator});
  });
  // Central hub
  const cp=project(0,0,0),ct=project(0,38,0);
  ctx.beginPath();ctx.ellipse(cp[0],cp[1],42*sc,19*sc,0,0,Math.PI*2);ctx.fillStyle='#ffd5b8';ctx.fill();
  ctx.beginPath();ctx.ellipse(ct[0],ct[1],42*sc,19*sc,0,0,Math.PI*2);ctx.fillStyle='#f97316';ctx.fill();
  ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font=`bold ${Math.max(10,13*sc)}px system-ui`;ctx.fillText('DID',ct[0],ct[1]+4);
  ctx.textAlign='left';
 }
 function requestPaint(){cancelAnimationFrame(raf);raf=requestAnimationFrame(paint)}
 function start(e){dragging=true;moved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)}
 function move(e){if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;angle+=dx*.008;elevation=Math.max(.25,Math.min(1.25,elevation+dy*.004));lastX=e.clientX;lastY=e.clientY;requestPaint()}
 function end(e){if(!dragging)return;dragging=false;if(!moved){const box=canvas.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;const hit=[...targets].reverse().find(n=>Math.hypot(x-n.x,y-n.y)<n.rad);if(hit){picked=hit.name;onOperator(hit.name)}}}
 function wheel(e){e.preventDefault();zoom=Math.max(.6,Math.min(2.2,zoom*(e.deltaY>0?.92:1.08)));requestPaint()}
 $effect(()=>{rows;angle;elevation;zoom;picked;requestPaint()});
 onMount(()=>{const observer=new ResizeObserver(requestPaint);observer.observe(canvas);requestPaint();return()=>{observer.disconnect();cancelAnimationFrame(raf)}});
</script>
<div class="v83-universe">
 <div class="v83-toolbar"><div><strong>Operator universe</strong><small>Drag to orbit · Scroll to zoom · Select a tower</small></div><div class="v83-controls"><button type="button" onclick={()=>{angle=-.68;elevation=.66;zoom=1}}>Reset view</button><button type="button" onclick={()=>zoom=Math.max(.6,zoom-.15)}>−</button><button type="button" onclick={()=>zoom=Math.min(2.2,zoom+.15)}>+</button></div></div>
 <div class="v83-stage"><canvas bind:this={canvas} aria-label="Interactive isometric 3D projection of DID operator inventory" onpointerdown={start} onpointermove={move} onpointerup={end} onpointercancel={()=>dragging=false} onwheel={wheel}></canvas>
 {#if !rows.length}<div class="v83-empty">No synchronized DID inventory yet. Run inventory sync to populate the universe.</div>{/if}
 <div class="v83-overlay"><strong>{operators.length} operators</strong><span>{operators.reduce((n,r)=>n+r.assigned,0)} assigned · {operators.reduce((n,r)=>n+r.available,0)} pool</span><span>{pending} pending requests</span></div></div>
 <div class="v83-bottom"><div class="v83-legend"><span><i style="background:#f97316"></i>Assigned</span><span><i style="background:#3b82f6"></i>Available</span><span><i style="background:#94a3b8"></i>Other</span></div><small>Visual size represents DID count, not physical office locations. Showing up to 16 largest operators.</small></div>
 {#if chosen}<div class="v83-selection"><div><small>Selected operator</small><strong>{chosen.operator}</strong></div><div><small>Assigned</small><strong>{chosen.assigned}</strong></div><div><small>Available</small><strong>{chosen.available}</strong></div><div><small>Duplicates</small><strong>{chosen.duplicates}</strong></div><button type="button" onclick={()=>{picked='';onOperator('all')}}>Clear</button></div>{/if}
</div>
<style>
 .v83-universe{border:1px solid #e6eaf0;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 12px 30px #16233b08}
 .v83-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:16px 20px;border-bottom:1px solid #edf0f5}.v83-toolbar strong{display:block;font-size:17px;color:#18283d}.v83-toolbar small{display:block;font-size:12px;color:#718096;margin-top:3px}
 .v83-controls{display:flex;gap:6px}.v83-controls button,.v83-selection button{background:#fff;border:1px solid #dce3ec;border-radius:8px;padding:7px 12px;cursor:pointer;color:#344054;font-weight:600}
 .v83-stage{position:relative;height:460px;background:#f8fbff}.v83-stage canvas{width:100%;height:100%;display:block;cursor:grab;touch-action:none}.v83-stage canvas:active{cursor:grabbing}
 .v83-overlay{position:absolute;left:15px;top:15px;display:grid;gap:5px;padding:12px 15px;background:#ffffffea;border:1px solid #e6eaf0;border-radius:12px;pointer-events:none;font-size:12px;color:#64748b}.v83-overlay strong{font-size:14px;color:#152b45}
 .v83-bottom{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:13px 18px;color:#718096;font-size:12px}.v83-legend{display:flex;gap:13px}.v83-legend span{display:flex;align-items:center;gap:6px}.v83-legend i{width:9px;height:9px;border-radius:50%}
 .v83-selection{display:flex;gap:20px;align-items:center;flex-wrap:wrap;padding:15px 20px;background:#fff8f3;border-top:1px solid #ffe2cc}.v83-selection div{display:grid;gap:3px}.v83-selection small{font-size:11px;color:#777}.v83-selection strong{font-size:14px;color:#24364a}
 .v83-empty{position:absolute;top:55%;left:50%;transform:translate(-50%,-50%);background:white;padding:15px;border-radius:12px;box-shadow:0 4px 24px #0001;text-align:center;color:#64748b;pointer-events:none}
 @media(max-width:650px){.v83-stage{height:340px}.v83-toolbar{flex-direction:column;align-items:flex-start}.v83-controls{align-self:flex-end}.v83-overlay{font-size:10px;padding:8px}.v83-bottom{flex-direction:column}}
 @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>

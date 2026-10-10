import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const out='/home/alice/.cache/spaceship-management-sim-120', proof=process.argv.includes('--proof');
const dir=out+(proof?'/proof':'/full');await mkdir(dir,{recursive:true});
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true});
const ctx=await b.newContext({viewport:{width:1000,height:640},recordVideo:{dir,size:{width:1000,height:640}}});
const p=await ctx.newPage();p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:8120/?seed=7');await p.waitForFunction(()=>window.demo);
const sleep=ms=>p.waitForTimeout(ms);
const box=()=>p.locator('#info-line').innerText();
let zoom=3;
async function hover(x,y=0){await p.mouse.move(500+(x-20)*zoom,320+y*zoom);await sleep(250);}
async function assert(text){const t=await box();if(!t.includes(text))throw Error('Expected '+text+' got '+t);console.log(t);}
async function label(text){await p.evaluate(t=>{let e=document.getElementById('demo-caption');if(!e){e=document.createElement('div');e.id='demo-caption';e.style.cssText='position:fixed;top:55px;left:20px;background:#111827e8;color:white;padding:10px;font:16px monospace;pointer-events:none';document.body.append(e);}e.textContent=t;},text);}
async function build(cap){await p.mouse.move(500,320);await sleep(200);await p.locator('#build-controls button[data-x="80"][data-y="0"]').click();await sleep(200);const text=await p.locator('#build-menu button[data-module="Storage"]').innerText();if(!text.includes('25 Metal')||!text.includes('25 Ice'))throw Error('Bad cost '+text);await label('Scene 3 · criteria 3, 6 · '+text.replaceAll('\n',' '));await sleep(1800);await p.screenshot({path:dir+'/cost.png'});await p.locator('#build-menu button[data-module="Storage"]').click();await p.locator('[data-speed="4"]').click();await hover(40);await sleep(4400);await p.locator('[data-speed="pause"]').click();await hover(40);await assert('/ '+cap);await label('Scene 3 · criteria 3, 6 · '+(await box()).split('\n')[0]);await sleep(2000);await p.screenshot({path:dir+'/capacity-'+cap+'.png'});}
try{
if(proof){await p.evaluate(()=>window.demo.stock());await build(2000);}
else{
await hover(40);await assert('Stored 0 / 1000');await label('Scene 1 · criterion 1 · '+(await box()).split('\n')[0]);await sleep(2400);await p.screenshot({path:dir+'/scene-1.png'});
await p.evaluate(()=>window.demo.found());await p.mouse.move(560,320);await sleep(400);await assert('/ 1000');await label('Scene 2 · criterion 2 · '+(await box()).split('\n')[0]);await sleep(2400);await p.screenshot({path:dir+'/scene-2.png'});
await p.evaluate(()=>{window.demo.reset();window.demo.stock();});await build(2000);
// Third module is built at the next free eastern slot, after the second is complete.
await p.mouse.move(650,320);await sleep(200);await p.locator('#build-controls button[data-x="120"][data-y="0"]').click();await p.locator('#build-menu button[data-module="Storage"]').click();await p.locator('[data-speed="4"]').click();await hover(40);await sleep(4400);await p.locator('[data-speed="pause"]').click();await hover(40);await assert('/ 3000');await label('Scene 3 · criteria 3, 6 · '+(await box()).split('\n')[0]);await sleep(2000);await p.screenshot({path:dir+'/scene-3.png'});
zoom=5;await p.evaluate(()=>window.demo.delivery(false));await hover(40);await label('Scene 4 · criteria 4, 5, 7 · '+(await box()).split('\n')[0]);await p.locator('[data-speed="2"]').click();await hover(40);await sleep(4000);await p.locator('[data-speed="pause"]').click();await hover(40);await assert('Stored 105 / 1000');await label('Scene 4 · criteria 4, 5, 7 · '+(await box()).split('\n')[0]);await sleep(1500);await p.screenshot({path:dir+'/past-100.png'});
await p.evaluate(()=>window.demo.delivery(true));await hover(40);await label('Scene 4 · criteria 4, 5, 7 · '+(await box()).split('\n')[0]);await p.locator('[data-speed="2"]').click();await hover(40);await sleep(5000);await p.locator('[data-speed="pause"]').click();await hover(40);await assert('Stored 1000 / 1000');await label('Scene 4 · criteria 4, 5, 7 · '+(await box()).split('\n')[0]);await sleep(2000);await p.screenshot({path:dir+'/scene-4.png'});
const s=await p.evaluate(()=>window.demo.get());console.log('Full ship',JSON.stringify(s.ships[0]));if(s.ships[0].cargo!==5)throw Error('Excess cargo not retained');await p.evaluate(()=>window.demo.showShip());await p.mouse.move(500,320);await sleep(500);await assert('storage full');await label('Scene 4 · criterion 5 · '+await box());await sleep(1800);await p.screenshot({path:dir+'/waiting.png'});
}
}finally{await ctx.close();const video=await p.video().path();await writeFile(dir+'/video-path.txt',video);console.log('VIDEO',video);await b.close();}

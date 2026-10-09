import esbuild from '/home/alice/repos/.worktrees/spaceship-120/node_modules/esbuild/lib/main.js';
import {readFile,writeFile} from 'node:fs/promises';
const root='/home/alice/repos/.worktrees/spaceship-120', out='/home/alice/.cache/spaceship-management-sim-120';
const fixture=`
import { MODULE_COST, BUILD_SECONDS, placeStation, dockBerths } from "sim";
import { ONE_STORAGE } from "../../sim/src/test-ships";
window.demo = {
 get:()=>state,
 showShip:()=>{ui.camera={center:{...state.ships[0].position},zoom:3};},
 reset:()=>{state=createInitialState(7); ui.clock.paused=true; ui.currentSector=0; ui.camera={center:{x:20,y:0},zoom:3};},
 stock:()=>{state={...state,stations:state.stations.map(s=>({...s,constructionSite:{...s.constructionSite,inventory:{Metal:2*MODULE_COST.Metal,Ice:2*MODULE_COST.Ice}}}))};},
 step:(n)=>{for(let i=0;i<n*30;i++)state=tick(state,1/30);},
 found:()=>{state=placeStation(state,1,{x:-512,y:0}); state={...state,stations:state.stations.map(s=>s.id===0?s:{...s,constructionSite:{...s.constructionSite,inventory:{Metal:2*MODULE_COST.Metal,Ice:2*MODULE_COST.Ice}}})}; for(let i=0;i<(2*BUILD_SECONDS+1)*30;i++)state=tick(state,1/30); ui.currentSector=1;ui.camera={center:{x:-512,y:0},zoom:3};},
 delivery:(nearFull)=>{const s=createInitialState(7),h=s.stations[0],ship=s.ships[0];const metal=nearFull?600:70,ice=nearFull?395:25;state={...s,stations:[{...h,inventory:{Metal:metal,Ice:ice}}],ships:[{...ship,design:ONE_STORAGE,state:'unloading',position:dockBerths(h.dock.position)[0],timer:6,cargo:10,cargoMaterial:'Metal',cargoByMaterial:{Metal:10,Ice:0},berth:0,transfer:{startingCargo:10,amount:10},defaultBehaviour:'mine',mineMaterials:['Metal','Ice']}]}; ui.currentSector=0;ui.camera={center:{x:20,y:0},zoom:5};ui.clock.paused=true;},
 constants:{MODULE_COST,BUILD_SECONDS}
}; window.demo.reset();
`;
await esbuild.build({entryPoints:[root+'/app/src/main.ts'],bundle:true,format:'esm',outfile:out+'/main.js',plugins:[{name:'demo',setup(b){b.onLoad({filter:/app\/src\/main\.ts$/},async a=>({contents:(await readFile(a.path,'utf8'))+fixture,loader:'ts'}));}}]});
await writeFile(out+'/index.html',await readFile(root+'/app/index.html','utf8'));

import esbuild from '/home/alice/repos/.worktrees/spaceship-119/node_modules/esbuild/lib/main.js';
import {readFile,writeFile} from 'node:fs/promises';
const root='/home/alice/repos/.worktrees/spaceship-119';
const out='/home/alice/.cache/spaceship-management-sim-119';
await esbuild.build({entryPoints:[root+'/app/src/main.ts'],bundle:true,format:'esm',outfile:out+'/main.js',plugins:[{name:'demo',setup(b){b.onLoad({filter:/app\/src\/main\.ts$/},async a=>({contents:(await readFile(a.path,'utf8'))+'\nimport { installIssue119Demo } from "../../tools/issue-119-demo-fixture"; installIssue119Demo(ui,()=>state,(next)=>{state=next;});',loader:'ts'}));}}]});
await writeFile(out+'/index.html',await readFile(root+'/app/index.html','utf8'));

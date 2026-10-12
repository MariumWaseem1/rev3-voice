// Keep the web service and its reconciliation loop in one supervised instance.
const {spawn}=require('node:child_process');
const children=[];let stopping=false;
function stop(code){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),8000).unref();}
function start(args){const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});children.push(child);child.on('error',()=>stop(1));child.on('exit',code=>{if(!stopping)stop(code||1)});return child;}
process.on('SIGTERM',()=>stop(0));process.on('SIGINT',()=>stop(0));
start(['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0']);
if(process.env.RUN_MAINTENANCE==='true')start(['node_modules/tsx/dist/cli.mjs','scripts/maintenance.ts']);

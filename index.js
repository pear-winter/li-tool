import { startWorkbench } from './workbench.js';
const OWNER='__cyll_pear_hub_v1__';
let disabled=false,started=false,timer,entry;
const required=['getWorldbookNames','getWorldbook','updateWorldbookWith','getGlobalWorldbookNames','rebindGlobalWorldbooks','getCharWorldbookNames'];
function ready(){return window.SillyTavern?.getContext?.()&&required.every(name=>typeof window.TavernHelper?.[name]==='function'||typeof window[name]==='function');}
function addEntry(){
 if(entry?.isConnected)return;
 const parent=document.querySelector('#extensions_settings2')||document.querySelector('#extensions_settings');
 if(!parent)return;
 entry=document.createElement('div');entry.id='lili-workbench-extension-settings';entry.className='extension_container';
 const button=document.createElement('button');button.type='button';button.className='menu_button';button.textContent='🍐 打开梨梨工作台';
 button.addEventListener('click',()=>{if(!started)start(0);if(started)window[OWNER]?.open?.();else window.toastr?.warning('请开启酒馆助手 4.10 或更新版，刷新酒馆后再打开。','梨梨工作台');});
 entry.append(button);parent.append(entry);
}
function start(attempt=0){
 if(disabled||started)return;
 clearTimeout(timer);addEntry();
 if(!ready()){
  if(attempt<120)timer=setTimeout(()=>start(attempt+1),250);
  else window.toastr?.warning('工作台需要酒馆助手接口。请开启酒馆助手后刷新，或在扩展设置里重新打开工作台。','梨梨工作台');
  return;
 }
 try{startWorkbench();started=true;}catch(error){window[OWNER]?.dispose?.();console.error('[梨梨工作台]',error);window.toastr?.error('工作台启动失败，请查看控制台。','梨梨工作台');}
}
export function onDisable(){disabled=true;clearTimeout(timer);window[OWNER]?.dispose?.();entry?.remove();entry=null;started=false;}
export function onEnable(){disabled=false;start();}
const context=window.SillyTavern?.getContext?.();
const event=context?.eventTypes?.APP_READY||context?.event_types?.APP_READY;
if(event&&context?.eventSource?.once)context.eventSource.once(event,()=>{setTimeout(()=>start(),0);});
else if(document.readyState==='complete')setTimeout(()=>start(),0);
else window.addEventListener('load',()=>start(),{once:true});

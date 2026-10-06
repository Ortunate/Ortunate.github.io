import {createWorldRuntime,type Request} from '../lib/worlds/runtime.ts';
const runtime=createWorldRuntime(reply=>self.postMessage(reply),true);self.onmessage=(event:MessageEvent<Request>)=>runtime.handle(event.data);

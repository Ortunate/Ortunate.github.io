import { createKineticRuntime } from '../lib/kinetic/runtime.ts';
const runtime=createKineticRuntime(message=>self.postMessage(message));
self.onmessage=event=>{void runtime.handle(event.data);};

export function encodeWav(channels:Float32Array[],sampleRate:number):ArrayBuffer {
  if(channels.length!==2||channels[0].length!==channels[1].length||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000)throw new Error('Expected stereo PCM audio.');
  const frames=channels[0].length,buffer=new ArrayBuffer(44+frames*4),view=new DataView(buffer);
  const text=(offset:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,frames*4,true);
  for(let frame=0;frame<frames;frame++)for(let ch=0;ch<2;ch++){const raw=channels[ch][frame],sample=Number.isFinite(raw)?Math.max(-1,Math.min(1,raw)):0;view.setInt16(44+(frame*2+ch)*2,Math.round(sample*(sample<0?32768:32767)),true);}return buffer;
}

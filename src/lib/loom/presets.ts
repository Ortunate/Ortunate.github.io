import { newProject, generateTrack, resizeTrack, type SoundProject } from './model.ts';
function preset(name:string,bpm:number,seed:number,counts:number[],trackLengths:number[],scale:SoundProject['scale']='minor',swing=.5){
  let p={...newProject(name),bpm,seed,scale,swing};
  counts.forEach((count,i)=>{p=resizeTrack(p,i,trackLengths[i]??16);p=generateTrack(p,i,count,i===1?4:0);});
  return p;
}
export const presets:SoundProject[]=[
  preset('01 / Soft machinery',96,17,[4,2,8,3,4,5],[16,16,16,16,16,16],'minor',.56),
  preset('02 / Between the beats',108,73,[5,3,9,5,5,7],[16,16,16,16,16,16],'dorian',.6),
  preset('03 / Three against four',90,219,[4,3,6,5,3,5],[16,12,16,12,16,24]),
  preset('04 / Room to breathe',64,42,[2,0,3,2,2,3],[32,16,32,24,32,24],'major'),
  preset('05 / Copper melody',112,134,[4,2,10,3,6,9],[16,16,16,16,16,32],'major',.54),
  preset('06 / Long way home',82,991,[3,2,7,5,4,7],[24,16,12,32,24,32],'dorian',.57),
];

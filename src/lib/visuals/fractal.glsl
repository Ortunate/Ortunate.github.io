precision highp float;
uniform vec2 resolution;
uniform vec3 eye;
uniform float preset,complexity,palette,lightAngle,quality;

float mandelbulb(vec3 p){
 vec3 z=p;float dr=1.0,r=0.0;float power=complexity;
 for(int i=0;i<9;i++){
  r=length(z);if(r>2.5)break;
  float safeR=max(r,.00001),theta=acos(clamp(z.z/safeR,-1.0,1.0)),phi=atan(z.y,z.x);
  dr=pow(safeR,power-1.0)*power*dr+1.0;
  float zr=pow(safeR,power);theta*=power;phi*=power;
  z=zr*vec3(sin(theta)*cos(phi),sin(phi)*sin(theta),cos(theta))+p;
 }
 return .5*log(max(r,.00001))*r/max(dr,.00001);
}
float mandelbox(vec3 p){
 vec3 z=p*2.5,c=z;float derivative=1.0,scale=-1.55-(complexity-4.0)*.035;
 for(int i=0;i<11;i++){
  z=clamp(z,-1.0,1.0)*2.0-z;
  float r2=dot(z,z),fold=clamp(1.0/max(r2,.001),1.0,4.0);
  z*=fold;derivative*=fold;
  z=z*scale+c;derivative=derivative*abs(scale)+1.0;
 }
 return length(z)/abs(derivative)/2.5;
}
float field(vec3 p){return preset<.5?mandelbulb(p):mandelbox(p);}
vec3 normalAt(vec3 p,float e){
 vec2 k=vec2(1.0,-1.0);
 return normalize(k.xyy*field(p+k.xyy*e)+k.yyx*field(p+k.yyx*e)+k.yxy*field(p+k.yxy*e)+k.xxx*field(p+k.xxx*e));
}
float shadow(vec3 p,vec3 direction){
 float shade=1.0,distance=.012;
 for(int i=0;i<24;i++){
  if(float(i)>mix(8.0,23.0,quality))break;
  float d=max(field(p+direction*distance),.0001);
  shade=min(shade,14.0*d/distance);distance+=clamp(d,.01,.18);if(distance>3.0)break;
 }
 return clamp(shade,.15,1.0);
}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*resolution)/resolution.y;
 vec3 forward=normalize(-eye),right=normalize(cross(forward,vec3(0,1,0))),up=cross(right,forward);
 vec3 direction=normalize(forward*1.9+right*uv.x+up*uv.y);
 float b=dot(eye,direction),h=b*b-dot(eye,eye)+2.1*2.1;
 vec3 background=mix(vec3(.025,.031,.043),vec3(.004,.006,.012),smoothstep(0.0,.85,length(uv)));
 vec3 color=background;
 if(h>=0.0){
  float start=max(0.0,-b-sqrt(h)),end=-b+sqrt(h),t=start;bool hit=false;
  for(int i=0;i<150;i++){
   if(float(i)>mix(65.0,149.0,quality))break;
   float d=field(eye+direction*t);float epsilon=max(.00022,t/resolution.y*.4);
   if(d<epsilon){hit=true;break;}t+=max(d*.8,.0001);if(t>end)break;
  }
  if(hit){
   vec3 p=eye+direction*t;float epsilon=max(.00035,t/resolution.y*.6);vec3 n=normalAt(p,epsilon);
   vec3 light=normalize(vec3(cos(lightAngle)*2.5,2.8,sin(lightAngle)*2.5));
   float occlusion=0.0,weight=1.0;
   for(int i=1;i<=4;i++){float d=float(i)*.045;occlusion+=(d-field(p+n*d))*weight;weight*=.55;}
   float ao=clamp(1.0-occlusion*3.5,.15,1.0);
   float diffuse=max(dot(n,light),0.0)*shadow(p+n*epsilon*4.0,light);
   float rim=pow(1.0-max(dot(n,-direction),0.0),3.0);
   vec3 base=vec3(.43,.46,.5),accent=vec3(.35,.55,.7);
   if(palette>.5&&palette<1.5){base=vec3(.55,.47,.36);accent=vec3(.7,.56,.35);}
   if(palette>1.5&&palette<2.5){base=vec3(.3,.46,.42);accent=vec3(.4,.66,.58);}
   if(palette>2.5){base=vec3(.5,.4,.47);accent=vec3(.64,.5,.7);}
   float specular=pow(max(dot(n,normalize(light-direction)),0.0),48.0)*diffuse;
   color=base*(.17+diffuse*.95)*ao+accent*rim*.5+vec3(.85,.9,1.0)*specular*.5;
   color+=base*.045*max(n.y,0.0);
  }
 }
 color=color/(color+vec3(.7));
 gl_FragColor=vec4(pow(color,vec3(1.0/2.2)),1.0);
}

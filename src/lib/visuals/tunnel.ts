import * as THREE from 'three';
import { disposeScene } from './types';
import type { GPUStudy } from './types';
/** Instanced stars extend in view space along their projected velocity. */
export function createTunnel(): GPUStudy {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(58, 1, .1, 260);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const count = 4200, seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++)
        seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { travel: { value: 0 }, velocity: { value: .12 }, time: { value: 0 }, dust: { value: 0 }, viewport: { value: new THREE.Vector2() }, tint: { value: new THREE.Color(0xbacbdd) } },
        vertexShader: `
 attribute vec4 seed;uniform float travel,velocity,time,dust;uniform vec2 viewport;
 varying vec2 vUv;varying float vAlpha;varying float vTone;
 void main(){
  float layer=floor(seed.w*3.0),depth=180.0+layer*25.0;
  float z=mod(seed.z*depth+travel*(22.0+layer*8.0),depth);
  float angle=seed.x*6.2831853;
  float radius=pow(seed.y,.55)*(48.0+layer*15.0)+2.0;
  vec2 xy=vec2(cos(angle),sin(angle))*radius;
  vec2 belt=vec2((seed.x-.5)*110.0,(seed.y-.5)*8.0+sin(seed.x*11.0)*6.0);
  xy=mix(xy,mix(xy,belt,.72),dust);
  vec3 world=vec3(xy,z-depth);
  world.xy+=vec2(sin(world.z*.008+time*.035)*7.0,cos(world.z*.006+time*.025)*4.0);
  vec4 view=modelViewMatrix*vec4(world,1.0);
  vec4 projected=projectionMatrix*view;
  vec4 previous=projectionMatrix*(view-vec4(0.0,0.0,(.05+velocity*velocity*5.0),0.0));
  vec2 delta=(projected.xy/projected.w-previous.xy/previous.w)*viewport;
  float stretch=clamp(length(delta),0.0,90.0);
  vec2 direction=normalize(delta+vec2(.00001));
  // Keep the screen-space basis right-handed so CCW star quads stay front-facing.
  vec2 across=vec2(direction.y,-direction.x);
  float size=(.55+seed.w*.95)*clamp(38.0/max(1.0,-view.z),.5,2.0);
  vec2 offset=across*position.x*size+direction*position.y*(size+stretch*.5);
  projected.xy+=offset/viewport*2.0*projected.w;
  gl_Position=projected;vUv=position.xy;
  vAlpha=smoothstep(0.0,12.0,z)*smoothstep(0.0,7.0,-view.z)*(.22+seed.w*.7);
  vTone=seed.w;
 }`,
        fragmentShader: `uniform vec3 tint;varying vec2 vUv;varying float vAlpha;varying float vTone;
 void main(){float core=exp(-vUv.x*vUv.x*4.0)*pow(max(0.0,1.0-vUv.y*vUv.y),1.8);vec3 color=mix(tint,vec3(.98,.98,1.0),vTone*.7);gl_FragColor=vec4(color,core*vAlpha);}`
    });
    const stars = new THREE.Mesh(geometry, material);
    stars.frustumCulled = false;
    scene.add(stars);
    return { scene, camera, resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); material.uniforms.viewport.value.set(w, h); }, update(f) {
            const boost = (f.velocity - .12) / .52;
            camera.fov = 58 + boost * 9;
            camera.position.set(f.x * 9, f.y * 5, 0);
            camera.lookAt(f.x * 17, f.y * 9, -80);
            camera.rotateZ(-f.x * .04);
            camera.updateProjectionMatrix();
            material.uniforms.travel.value = f.phase;
            material.uniforms.velocity.value = f.velocity;
            material.uniforms.time.value = f.time;
            material.uniforms.dust.value = f.preset;
            material.uniforms.tint.value.set([0xbacbdd, 0xe1c7ac, 0xb8d9d0, 0xd0c4e0][f.palette]);
            geometry.instanceCount = Math.min(count, Math.round(f.detail * (f.preview ? 12 : 35) * f.quality));
        }, dispose() { disposeScene(scene); } };
}

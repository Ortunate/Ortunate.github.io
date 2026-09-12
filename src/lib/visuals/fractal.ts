import * as THREE from 'three';
import { disposeScene } from './types';
import type { GPUStudy } from './types';
import fragmentShader from './fractal.glsl?raw';
export function createFractal(): GPUStudy {
    const scene = new THREE.Scene(), camera = new THREE.Camera();
    const material = new THREE.ShaderMaterial({ uniforms: { resolution: { value: new THREE.Vector2() }, eye: { value: new THREE.Vector3() }, preset: { value: 0 }, complexity: { value: 8 }, palette: { value: 0 }, lightAngle: { value: .7 }, quality: { value: 1 } }, vertexShader: 'void main(){gl_Position=vec4(position,1.0);}', fragmentShader });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { scene, camera, resize(w, h) { material.uniforms.resolution.value.set(w, h); }, update(f) {
            const angle = f.rotation + .65, tilt = THREE.MathUtils.clamp(f.tilt + .25, -1.2, 1.2), distance = 4.8 / f.zoom;
            material.uniforms.eye.value.set(Math.sin(angle) * Math.cos(tilt) * distance, Math.sin(tilt) * distance, Math.cos(angle) * Math.cos(tilt) * distance);
            material.uniforms.preset.value = f.preset;
            material.uniforms.complexity.value = f.detail;
            material.uniforms.palette.value = f.palette;
            material.uniforms.lightAngle.value = f.light;
            material.uniforms.quality.value = f.preview ? 0 : f.quality;
        }, dispose() { disposeScene(scene); } };
}

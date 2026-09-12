import type * as THREE from 'three';
export interface GPUFrame {
    time: number;
    dt: number;
    preset: number;
    palette: number;
    detail: number;
    strength: number;
    light: number;
    x: number;
    y: number;
    rotation: number;
    tilt: number;
    zoom: number;
    phase: number;
    velocity: number;
    preview: boolean;
    quality: number;
}
export interface GPUStudy {
    scene: THREE.Scene;
    camera: THREE.Camera;
    bloom?: boolean;
    update: (frame: GPUFrame) => void;
    resize: (width: number, height: number) => void;
    dispose: () => void;
}
export function disposeScene(scene: THREE.Scene) {
    scene.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.geometry)
        mesh.geometry.dispose(); if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach(material => material.dispose());
    } });
}

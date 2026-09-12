import * as THREE from 'three';
import { disposeScene } from './types';
import type { GPUStudy } from './types';
/** The original homepage composition. Home and the gallery use this same factory. */
export function createOrbit(): GPUStudy {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
    camera.position.set(0, 0, 8.8);
    const group = new THREE.Group();
    group.rotation.set(.35, 0, -.38);
    scene.add(group);
    group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.12, 4), new THREE.MeshBasicMaterial({ color: 0x8777b5, wireframe: true, transparent: true, opacity: .17 })));
    group.add(new THREE.Mesh(new THREE.SphereGeometry(1.08, 48, 48), new THREE.MeshBasicMaterial({ color: 0x0d0e19 })));
    function pointCloud(count: number, isOrbit: boolean) {
        const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2, radius = isOrbit ? 1.65 + Math.random() * .78 : 3 + Math.random() * 3;
            positions.set([Math.cos(a) * radius, isOrbit ? (Math.random() - .5) * .12 : (Math.random() - .5) * 6, Math.sin(a) * radius], i * 3);
            const color = new THREE.Color().setHSL(.69 + Math.random() * .08, .25 + Math.random() * .2, .45 + Math.random() * .4);
            colors.set([color.r, color.g, color.b], i * 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return new THREE.Points(geometry, new THREE.PointsMaterial({ size: isOrbit ? .015 : .011, vertexColors: true, transparent: true, opacity: isOrbit ? .9 : .5, blending: THREE.AdditiveBlending, depthWrite: false }));
    }
    const belt = pointCloud(9000, true);
    belt.rotation.x = .48;
    group.add(belt);
    scene.add(pointCloud(650, false));
    const rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
    for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85 + i * .32, .0035, 6, 220), new THREE.MeshBasicMaterial({ color: i === 2 ? 0xaecf8a : 0xaba0dd, transparent: true, opacity: i === 2 ? .3 : .65 }));
        ring.rotation.x = Math.PI / 2 + .48 + i * .07;
        group.add(ring);
        rings.push(ring);
    }
    const polar = new THREE.Mesh(new THREE.TorusGeometry(1.34, .004, 6, 180), new THREE.MeshBasicMaterial({ color: 0xd4c4ff, transparent: true, opacity: .45 }));
    polar.rotation.y = .6;
    group.add(polar);
    return { scene, camera, bloom: true, resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }, update(f) {
            group.rotation.set(.35 + f.y * .12 + f.tilt, f.time * .065 + f.rotation, -.38);
            camera.position.set(f.x * .4, 0, 8.8 / f.zoom);
            camera.lookAt(0, 0, 0);
            const scale = f.detail / 1.8;
            belt.scale.set(scale, 1, scale);
            belt.geometry.setDrawRange(0, f.preview ? 4500 : 9000);
            belt.material.color.set(f.palette === 0 ? 0xffffff : [0xffffff, 0xffc8a0, 0xb6ffe0, 0xefc7ff][f.palette]);
            rings.forEach((ring, i) => { ring.scale.setScalar(scale); ring.rotation.x = Math.PI / 2 + .48 + i * .07 + (f.preset ? Math.sin(f.time * .13 + i) * .65 : 0); });
            polar.rotation.y = .6 + (f.preset ? f.time * .09 : 0);
        }, dispose() { disposeScene(scene); } };
}

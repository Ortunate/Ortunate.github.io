import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createOrbit } from './visuals/orbit';
import { createTunnel } from './visuals/tunnel';
import { createFractal } from './visuals/fractal';
import type { GPUStudy, GPUFrame } from './visuals/types';
let thumbnailRenderer: THREE.WebGLRenderer | undefined;
const factories: Record<string, () => GPUStudy> = { orbit: createOrbit, tunnel: createTunnel, fractal: createFractal };
/** Detail scenes own their canvas; thumbnails share a single GPU context. */
export class StudyRenderer {
    study: GPUStudy;
    renderer: THREE.WebGLRenderer;
    composer?: EffectComposer;
    failed = false;
    width = 0;
    height = 0;
    constructor(public canvas: HTMLCanvasElement, public kind: string, public preview = false) {
        this.study = factories[kind]();
        try {
            this.renderer = preview ? (thumbnailRenderer ??= this.createRenderer()) : this.createRenderer(canvas);
            if (this.study.bloom) {
                this.composer = new EffectComposer(this.renderer);
                this.composer.addPass(new RenderPass(this.study.scene, this.study.camera));
                this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), .8, .65, .35));
            }
        }
        catch (error) {
            this.study.dispose();
            throw error;
        }
    }
    private createRenderer(canvas?: HTMLCanvasElement) {
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: this.kind !== 'fractal', preserveDrawingBuffer: true, powerPreference: 'high-performance' });
        renderer.setClearColor(0x090b12, 1);
        return renderer;
    }
    render(width: number, height: number, frame: GPUFrame) {
        if (this.failed)
            throw Error('This study could not be rendered.');
        // Shader errors belong to the study currently rendering, not to every thumbnail.
        this.renderer.debug.onShaderError = () => { this.failed = true; };
        // setSize writes canvas.width even when unchanged, reallocating the buffer.
        if (this.renderer.domElement.width !== width || this.renderer.domElement.height !== height)
            this.renderer.setSize(width, height, false);
        if (width !== this.width || height !== this.height) {
            this.width = width;
            this.height = height;
            this.study.resize(width, height);
            this.composer?.setSize(width, height);
        }
        this.study.update(frame);
        if (this.composer)
            this.composer.render(0);
        else
            this.renderer.render(this.study.scene, this.study.camera);
        if (this.failed)
            throw Error('Shader compilation failed.');
        if (this.preview) {
            const ctx = this.canvas.getContext('2d')!;
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(this.renderer.domElement, 0, 0);
        }
    }
    dispose() {
        this.composer?.passes.forEach(pass => pass.dispose());
        this.composer?.dispose();
        this.study.dispose();
        if (!this.preview)
            this.renderer.dispose();
    }
}
export function disposeWebGL() { thumbnailRenderer?.dispose(); thumbnailRenderer = undefined; }

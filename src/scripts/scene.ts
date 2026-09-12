const host = document.getElementById('orbit-scene');
if (host) {
    const start = async () => {
        try {
            const THREE = await import('three');
            const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }] = await Promise.all([import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js')]);
            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
            renderer.setClearColor(0x090b12, 0);
            host.appendChild(renderer.domElement);
            const { createOrbit } = await import('../lib/visuals/orbit');
            const study = createOrbit(), scene = study.scene, camera = study.camera;
            let elapsed = 0, viewX = 0, viewY = 0;
            const composer = new EffectComposer(renderer);
            composer.addPass(new RenderPass(scene, camera));
            composer.addPass(new UnrealBloomPass(new THREE.Vector2(600, 600), .8, .65, .35));
            const resize = () => { const r = host.getBoundingClientRect(); renderer.setSize(r.width, r.height); composer.setSize(r.width, r.height); study.resize(r.width, r.height); draw(); };
            let pointerX = 0, pointerY = 0, frame = 0, last = 0, visible = true, contextLost = false;
            const reduced = () => document.documentElement.dataset.motion === 'reduced';
            function draw() { study.update({ time: elapsed, dt: 0, preset: 0, palette: 0, detail: 1.8, strength: 1, light: .7, x: viewX, y: viewY, rotation: 0, tilt: 0, zoom: 1, phase: 0, velocity: .12, preview: false, quality: 1 }); composer.render(); }
            function animate(time: number) { frame = 0; if (document.hidden || !visible || reduced())
                return; const dt = Math.min((time - last) / 1000, .04); last = time; elapsed += dt; viewX += (pointerX - viewX) * .035; viewY += (pointerY - viewY) * .04; draw(); frame = requestAnimationFrame(animate); }
            function sync() { cancelAnimationFrame(frame); frame = 0; if (contextLost)
                return; draw(); if (!document.hidden && visible && !reduced()) {
                last = performance.now();
                frame = requestAnimationFrame(animate);
            } }
            host.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse')
                return; const r = host.getBoundingClientRect(); pointerX = (e.clientX - r.left) / r.width - .5; pointerY = (e.clientY - r.top) / r.height - .5; });
            host.addEventListener('pointerleave', () => { pointerX = pointerY = 0; });
            const observer = new ResizeObserver(resize);
            observer.observe(host);
            const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); });
            intersection.observe(host);
            document.addEventListener('visibilitychange', sync);
            window.addEventListener('motionchange', sync);
            renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; cancelAnimationFrame(frame); host.classList.remove('loaded'); renderer.domElement.style.display = 'none'; });
            resize();
            host.classList.add('loaded');
            sync();
            window.addEventListener('pageshow', sync);
            window.addEventListener('pagehide', event => { cancelAnimationFrame(frame); if (event.persisted)
                return; observer.disconnect(); intersection.disconnect(); study.dispose(); composer.passes.forEach(pass => pass.dispose()); composer.dispose(); renderer.dispose(); });
        }
        catch {
            host.classList.remove('loaded');
            host.querySelector('canvas')?.remove();
        }
    };
    if ('requestIdleCallback' in window)
        window.requestIdleCallback(() => void start(), { timeout: 1000 });
    else
        setTimeout(() => void start(), 150);
}

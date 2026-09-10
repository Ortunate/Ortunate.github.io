const host = document.getElementById('orbit-scene');
if (host) {
  const start = async () => {
    try {
      const THREE = await import('three');
      const [{EffectComposer}, {RenderPass}, {UnrealBloomPass}] = await Promise.all([import('three/addons/postprocessing/EffectComposer.js'),import('three/addons/postprocessing/RenderPass.js'),import('three/addons/postprocessing/UnrealBloomPass.js')]);
      const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, powerPreference:'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8)); renderer.setClearColor(0x090b12,0); host.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40,1,.1,100); camera.position.set(0,0,8.8);
      const group = new THREE.Group(); group.rotation.set(.35,0,-.38); scene.add(group);
      const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1.12,4),new THREE.MeshBasicMaterial({color:0x8777b5,wireframe:true,transparent:true,opacity:.17})); group.add(sphere);
      const core = new THREE.Mesh(new THREE.SphereGeometry(1.08,48,48),new THREE.MeshBasicMaterial({color:0x0d0e19})); group.add(core);
      function pointCloud(count: number, orbit: boolean) {
        const positions = new Float32Array(count*3), colors=new Float32Array(count*3);
        for(let i=0;i<count;i++) {
          const a=Math.random()*Math.PI*2, radius=orbit?1.65+Math.random()*.78:3+Math.random()*3;
          positions[i*3]=Math.cos(a)*radius; positions[i*3+1]=orbit?(Math.random()-.5)*.12:(Math.random()-.5)*6; positions[i*3+2]=Math.sin(a)*radius;
          const c = new THREE.Color().setHSL(.69+Math.random()*.08,.25+Math.random()*.2,.45+Math.random()*.4);
          colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;
        }
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
        return new THREE.Points(geometry,new THREE.PointsMaterial({size:orbit?.015:.011,vertexColors:true,transparent:true,opacity:orbit?.9:.5,blending:THREE.AdditiveBlending,depthWrite:false}));
      }
      const belt=pointCloud(9000,true);belt.rotation.x=.48;group.add(belt);scene.add(pointCloud(650,false));
      for(let i=0;i<3;i++) {
        const ring=new THREE.Mesh(new THREE.TorusGeometry(1.85+i*.32,.0035,6,220),new THREE.MeshBasicMaterial({color:i===2?0xaecf8a:0xaba0dd,transparent:true,opacity:i===2?.3:.65}));
        ring.rotation.x=Math.PI/2+.48+i*.07;group.add(ring);
      }
      const polar=new THREE.Mesh(new THREE.TorusGeometry(1.34,.004,6,180),new THREE.MeshBasicMaterial({color:0xd4c4ff,transparent:true,opacity:.45}));polar.rotation.y=.6;group.add(polar);
      const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));composer.addPass(new UnrealBloomPass(new THREE.Vector2(600,600),.8,.65,.35));
      const resize=()=>{const r=host.getBoundingClientRect();renderer.setSize(r.width,r.height);composer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();draw();};
      let pointerX=0,pointerY=0,frame=0,last=0,visible=true,contextLost=false;
      const reduced=()=>document.documentElement.dataset.motion==='reduced';
      function draw(){composer.render();}
      function animate(time:number){frame=0;if(document.hidden||!visible||reduced())return;const dt=Math.min((time-last)/1000,.04);last=time;group.rotation.y+=dt*.065;group.rotation.x+=(.35+pointerY*.12-group.rotation.x)*.04;camera.position.x+=(pointerX*.4-camera.position.x)*.035;camera.lookAt(0,0,0);draw();frame=requestAnimationFrame(animate);}
      function sync(){cancelAnimationFrame(frame);frame=0;if(contextLost)return;draw();if(!document.hidden&&visible&&!reduced()){last=performance.now();frame=requestAnimationFrame(animate);}}
      host.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;const r=host.getBoundingClientRect();pointerX=(e.clientX-r.left)/r.width-.5;pointerY=(e.clientY-r.top)/r.height-.5;});
      host.addEventListener('pointerleave',()=>{pointerX=pointerY=0;});
      const observer=new ResizeObserver(resize);observer.observe(host);
      const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();});intersection.observe(host);
      document.addEventListener('visibilitychange',sync);window.addEventListener('motionchange',sync);
      renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelAnimationFrame(frame);host.classList.remove('loaded');renderer.domElement.style.display='none';});
      resize();host.classList.add('loaded');sync();
      window.addEventListener('pageshow',sync);
      window.addEventListener('pagehide',event=>{cancelAnimationFrame(frame);if(event.persisted)return;observer.disconnect();intersection.disconnect();scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Points){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(m=>m.dispose());}});composer.dispose();renderer.dispose();});
    } catch { host.classList.remove('loaded');host.querySelector('canvas')?.remove(); }
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(()=>void start(),{timeout:1000});else setTimeout(()=>void start(),150);
}

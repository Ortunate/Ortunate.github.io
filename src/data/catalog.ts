export interface Entry { slug:string; title:string; category:string; description:string; icon:string; modes:readonly string[] }
export const games:Entry[]=[
{slug:'2048',title:'Cosmic 2048',category:'Strategy',description:'Slide, connect, and find a bigger possibility.',icon:'2048',modes:['Classic 4×4','Roomy 5×5','Same-number links','Doubling chain']},
{slug:'snake',title:'Neon Snake',category:'Reflex',description:'Find your rhythm. Follow the glow.',icon:'↳',modes:['Classic','Wraparound','Obstacles']},
{slug:'tetris',title:'Falling Blocks',category:'Arcade',description:'A little order in a falling universe.',icon:'▟',modes:['Marathon','40-line sprint']},
{slug:'breakout',title:'Prism Break',category:'Arcade',description:'Keep the light alive. Break through.',icon:'╱',modes:['Levels','Endless waves']},
{slug:'mines',title:'Minefield',category:'Strategy',description:'Read the numbers. Trust your deductions.',icon:'✳',modes:['Beginner','Intermediate','Expert']},
{slug:'memory',title:'Echo Pairs',category:'Memory',description:'Little constellations, waiting to be remembered.',icon:'◈',modes:['4×4 practice','6×4 practice','4×4 timed','6×4 timed']},
{slug:'puzzle',title:'Sliding Space',category:'Strategy',description:'Everything has a place. Find its way home.',icon:'▦',modes:['3×3 numbers','4×4 numbers','3×3 gradient','4×4 gradient']},
{slug:'life',title:'Game of Life',category:'Sandbox',description:'Draw a seed. Watch a world emerge.',icon:'⠿',modes:['Fixed edges','Wraparound']}];
export const utilities:Entry[]=[
{slug:'timer',title:'Focus Timer',category:'Everyday',description:'A little structure for your next stretch of focus.',icon:'◷',modes:[]},
{slug:'json',title:'JSON Studio',category:'Developer',description:'Format, compact, and make sense of your data.',icon:'{}',modes:[]},
{slug:'text',title:'Word Counter',category:'Everyday',description:'See the shape of your words, in any language.',icon:'Aa',modes:[]},
{slug:'timestamp',title:'Time Converter',category:'Developer',description:'Between timestamps, local time, and UTC.',icon:'↔',modes:[]},
{slug:'encoding',title:'Encode / Decode',category:'Developer',description:'Unicode-safe Base64 and URL conversion.',icon:'%_',modes:[]},
{slug:'color',title:'Color Workshop',category:'Creative',description:'Find a color. Make a gradient. Take the CSS.',icon:'◐',modes:[]},
{slug:'regex',title:'Regex Lab',category:'Developer',description:'Test expressions and inspect every capture.',icon:'.*',modes:[]},
{slug:'password',title:'Password Generator',category:'Everyday',description:'Fresh randomness, made only on your device.',icon:'⁕',modes:[]},
{slug:'units',title:'Unit Converter',category:'Everyday',description:'A quick change of scale or perspective.',icon:'⇄',modes:[]},
{slug:'draw',title:'Random Draw',category:'Everyday',description:'Names, ideas, possibilities. Leave it to chance.',icon:'↗',modes:[]}];
export const visuals:Entry[]=[
{slug:'orbit',title:'Orbital Field',category:'Geometry',description:'A little chaos. A little gravity.',icon:'01',modes:['Planetary rings','Multiple orbits']},
{slug:'ribbons',title:'Ribbon Trails',category:'Light',description:'Leave a trace of light behind you.',icon:'02',modes:['Silk','Neon']},
{slug:'repulsion',title:'Repulsion Grid',category:'Particles',description:'Make space. Watch it return.',icon:'03',modes:['Point field','Letter field']},
{slug:'gravity',title:'Gravity Wells',category:'Physics',description:'Move the center of a tiny universe.',icon:'04',modes:['Single core','Binary stars']},
{slug:'flow',title:'Flow Field',category:'Particles',description:'A thousand lines, finding their own way.',icon:'05',modes:['Ink currents','Wind field']},
{slug:'ripple',title:'Ripple Surface',category:'Physics',description:'One touch. Endless interference.',icon:'06',modes:['Water','Liquid metal']},
{slug:'aurora',title:'Aurora Curtains',category:'Light',description:'Catch the wind in a curtain of light.',icon:'07',modes:['Curtains','Light bands']},
{slug:'fractal',title:'Fractal Explorer',category:'Geometry',description:'Sculpted by mathematics. Revealed by light.',icon:'08',modes:['Mandelbulb','Mandelbox']},
{slug:'kaleidoscope',title:'Kaleidoscope',category:'Geometry',description:'A gesture, reflected into infinity.',icon:'09',modes:['Prism','Petals']},
{slug:'mesh',title:'Elastic Mesh',category:'Physics',description:'Pull on the fabric of this little space.',icon:'10',modes:['Plane','Hanging cloth']},
{slug:'flock',title:'Flocking',category:'Particles',description:'Individual motion. Collective instinct.',icon:'11',modes:['School of fish','Flight of birds']},
{slug:'tunnel',title:'Warp Tunnel',category:'Light',description:'A quiet drift. A sustained rush. An ocean of stars.',icon:'12',modes:['Deep Space','Dust Passage']}];

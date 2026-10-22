export interface Entry { slug:string; title:string; category:string; description:string; icon:string; modes:readonly string[]; aliases?:string }
export const games:Entry[]=[
{slug:'mines',title:'Minesweeper',category:'Board',description:'Read the numbers. Clear the field.',icon:'*',modes:['Beginner','Intermediate','Expert'],aliases:'\u626b\u96f7'},
{slug:'klondike',title:'Klondike Solitaire',category:'Cards',description:'The classic seven-column solitaire.',icon:'A',modes:['Draw one','Draw three'],aliases:'\u7eb8\u724c \u63a5\u9f99'},
{slug:'spider',title:'Spider Solitaire',category:'Cards',description:'Build complete runs from king to ace.',icon:'K',modes:['One suit','Two suits','Four suits'],aliases:'\u8718\u86db\u63a5\u9f99'},
{slug:'freecell',title:'FreeCell',category:'Cards',description:'Four free cells. Every card in sight.',icon:'4',modes:['Classic'],aliases:'\u7a7a\u5f53\u63a5\u9f99'},
{slug:'poker',title:'Texas Hold’em',category:'Cards',description:'Six seats, local bots, free virtual chips.',icon:'AA',modes:['Easy','Normal','Advanced'],aliases:'\u5fb7\u6251 \u5fb7\u5dde\u6251\u514b'},
{slug:'chess',title:'Chess',category:'Board',description:'A timeless game of plans and possibilities.',icon:'KQ',modes:['Easy','Normal','Advanced','Two players'],aliases:'\u56fd\u9645\u8c61\u68cb'},
{slug:'xiangqi',title:'Xiangqi',category:'Board',description:'Across the river. Defend your general.',icon:'XQ',modes:['Easy','Normal','Advanced','Two players'],aliases:'\u8c61\u68cb \u4e2d\u56fd\u8c61\u68cb'},
{slug:'2048',title:'Cosmic 2048',category:'Board',description:'Slide, connect, and find a bigger possibility.',icon:'2048',modes:['Classic 4x4','Roomy 5x5','Same-number links','Doubling chain']},
{slug:'snake',title:'Neon Snake',category:'Arcade',description:'Find your rhythm. Follow the glow.',icon:'S',modes:['Classic','Wraparound','Obstacles']},
{slug:'tetris',title:'Falling Blocks',category:'Arcade',description:'A little order in a falling universe.',icon:'T',modes:['Marathon','40-line sprint']},
{slug:'breakout',title:'Prism Break',category:'Arcade',description:'Keep the light alive. Break through.',icon:'B',modes:['Levels','Endless waves']}];
export const tabletopSlugs=['klondike','spider','freecell','poker','chess','xiangqi'];
export const retiredGames=['memory','puzzle','life'];
export const utilities:Entry[]=[
{slug:'image',title:'Image Bench',category:'Creative',description:'Crop, resize, compress, and find its colors. No uploads.',icon:'▧',modes:[]},
{slug:'csv',title:'CSV ↔ JSON',category:'Developer',description:'Turn tabular data into a different shape, locally.',icon:'⇆',modes:[]},
{slug:'diff',title:'Text Compare',category:'Developer',description:'See what changed, one line at a time.',icon:'+-',modes:[]},
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

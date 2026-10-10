import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const OLD_TOWN_STATIONS = Object.freeze([
  { id: 'cell-researcher', name: 'Cell researcher', position: [32, 3, 3.5], color: '#dce6e4', text: 'I am setting up this outdoor lab to create cells from aether-dust. Cell creation is not available yet.' },
  { id: 'donation', name: 'Settlement donation', position: [23, 3, 0], color: '#dfbb71', text: '' },
  { id: 'extractor', name: 'Extractor', position: [36, 3, 3.5], color: '#72dfec', text: '' },
  { id: 'arena-travel', name: 'Arena travel', position: [0, 0, 24], color: '#96e3f4', text: 'Choose where to travel. Enter the hunting grounds for Behemoth encounters, or visit Open Range to practice.' },
  { id: 'guide', name: 'Settlement guide', position: [-5, 0, 30], color: '#dfbb71', text: 'Welcome to Old Emberwatch. These streets are what remains of our settlement. Survivors from other settlements arrive here seeking shelter and help.' },
  { id: 'smith', name: 'Weapon smith', position: [23.5, 0, 13], color: '#d88457', text: 'The smith crafts swords and chainblades using currency and banked Behemoth parts.' },
  { id: 'armorer', name: 'Armorer', position: [26.5, 0, 13], color: '#80a3b1', text: 'The armorer will turn your gathered parts into armor and upgrades. Armor progression is not available in this mockup.' },
  { id: 'potions', name: 'Potion maker', position: [17, 0, 25], color: '#94b788', text: 'Herbs, bottles and remedies are prepared here for hunters and arriving survivors. Potion crafting is not available in this mockup.' },
  { id: 'sword', name: 'Striker Sword master', position: [-20, 6, -46], color: '#cc9764', text: 'Practice Focused Assault (LLL), Spirit Barrage (LHH), and Mighty Squall (HHH) in Open Range. Each completed combo earns its own Mantra.' },
  { id: 'repeaters', name: 'Repeaters master', position: [-32, 6, -46], color: '#7aabba', text: 'Repeaters reward close positioning: reload near your target for empowered shots. Open Range is available for practice.' },
  { id: 'chains', name: 'Chain Blades master', position: [-20, 6, -58], color: '#79b7ac', text: 'Use heavy strikes to wound, hits to build resources, and Q to push off before an airborne return or slam. Practice in Open Range.' },
  { id: 'future-master', name: 'Reserved training station', position: [-32, 6, -58], color: '#a69987', text: 'A station reserved for a future weapon master. Three weapons currently have masters in Old Emberwatch.' },
  { id: 'refugee', name: 'Arriving survivor', position: [29, 5, -37], color: '#bd9aa0', text: 'A Behemoth destroyed our settlement. We brought what we could carry. Refugees will arrive on and off with requests for help; quests are not available in this mockup.' },
  { id: 'travel', name: 'Hunting grounds / training', position: [5, 0, 42], color: '#89c8c0', text: 'Choose Cinderwild Isle to enter the hunting grounds, or Open Range to train. Hunting grounds support continuing encounters until you choose to return.' },
]);

export const OLD_TOWN = Object.freeze({ name: 'Old Emberwatch', arrival: [0, 0, 60] });

// Authored from the supplied old-town reference images: southern arrival circle,
// western watercourse, split market streets and a raised northern civic square.
// Original geometry, signage and emblem; units match the existing hunter controller.
export function createOldTownView() {
  const root = new THREE.Group(); root.name = OLD_TOWN.name;
  const materials = new Map();
  const colors = { timber: '#503c31', trim: '#aa7850', stone: '#777c80', paving: '#a59f91', roof: '#465763', wall: '#667b80', water: '#55b6c4' };
  function mesh(geometry, color, position, collision = true) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .88 }));
    const m = new THREE.Mesh(geometry, materials.get(color)); m.position.set(...position);
    m.castShadow = true; m.receiveShadow = true; m.userData.movementCollision = collision; root.add(m); return m;
  }
  const box = (size, color, p, collision = true) => mesh(new THREE.BoxGeometry(...size), color, p, collision);
  const cylinder = (r, h, color, p, collision = true, sides = 12) => mesh(new THREE.CylinderGeometry(r, r, h, sides), color, p, collision);
  function beam(a, b, width, color = colors.timber, collision = false) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const m = box([width, start.distanceTo(end), width], color, start.clone().add(end).multiplyScalar(.5).toArray(), collision);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return m;
  }
  function rail(ax, az, bx, bz, y) {
    beam([ax,y+1.1,az],[bx,y+1.1,bz],.17,colors.timber,true);
    const n = Math.ceil(Math.hypot(bx-ax,bz-az)/2.5);
    for(let i=0;i<=n;i++) box([.18,1.2,.18],colors.timber,[ax+(bx-ax)*i/n,y+.6,az+(bz-az)*i/n]);
  }
  const terraces=[];
  function terrace(x,z,w,d,y) { terraces.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,y}); }
  function buildTerraces() {
    // Partition each terrace union once, so adjoining decks never duplicate caps.
    // Tile placement uses one world grid per height, independent of deck origin.
    for(const y of new Set(terraces.map(t=>t.y))) {
      const decks=terraces.filter(t=>t.y===y);
      const xs=[...new Set(decks.flatMap(t=>[t.x0,t.x1]))].sort((a,b)=>a-b);
      const zs=[...new Set(decks.flatMap(t=>[t.z0,t.z1]))].sort((a,b)=>a-b);
      for(let ix=0;ix<xs.length-1;ix++) for(let iz=0;iz<zs.length-1;iz++) {
        const x0=xs[ix],x1=xs[ix+1],z0=zs[iz],z1=zs[iz+1];
        if(!decks.some(t=>(x0+x1)/2>t.x0&&(x0+x1)/2<t.x1&&(z0+z1)/2>t.z0&&(z0+z1)/2<t.z1)) continue;
        box([x1-x0,y+2.82,z1-z0],colors.stone,[(x0+x1)/2,(y-3.18)/2,(z0+z1)/2]);
        box([x1-x0,.18,z1-z0],colors.paving,[(x0+x1)/2,y-.09,(z0+z1)/2]).castShadow=false;
        for(let row=Math.floor(z0/2);row<Math.ceil(z1/2);row++) {
          const offset=((row%2)+2)%2*.5;
          for(let col=Math.floor((x0-offset)/3)-1;col<Math.ceil((x1-offset)/3);col++) {
            const ax=Math.max(x0,col*3+offset+.07),bx=Math.min(x1,col*3+offset+2.93);
            const az=Math.max(z0,row*2+.07),bz=Math.min(z1,row*2+1.93);
            if(bx-ax<.001||bz-az<.001) continue;
            const color=['#b0a797','#a69e91','#99988e'][((row*7+col*3)%3+3)%3];
            box([bx-ax,.015,bz-az],color,[(ax+bx)/2,y+.01,(az+bz)/2],false).castShadow=false;
          }
        }
      }
    }
  }
  function ramp(x, az, ay, bz, by, width) {
    const dz=bz-az, dy=by-ay, angle=-Math.atan2(dy,Math.abs(dz))*Math.sign(dz);
    const m=box([width,.3,Math.hypot(dz,dy)],colors.paving,[x,(ay+by)/2-.15,(az+bz)/2]); m.rotation.x=angle; m.castShadow=false;
    // Tread lines communicate a stair street while using a smooth collision surface.
    const count=Math.ceil(Math.abs(dz)/.7);
    for(let i=0;i<=count;i++) {
      const t=i/count;
      const line=box([width,.035,.08],'#827c71',[x,ay+dy*t+.018,az+dz*t],false); line.rotation.x=angle; line.castShadow=false;
    }
    for(const side of [-1,1]) {
      beam([x+side*width/2,ay+1.1,az],[x+side*width/2,by+1.1,bz],.16,colors.timber,true);
      for(let i=0;i<=4;i++) box([.2,1.2,.2],colors.timber,[x+side*width/2,ay+dy*i/4+.6,az+dz*i/4]);
    }
  }
  function house(x,z,w,d,y=0,h=6,color=colors.wall) {
    box([w,h,d],color,[x,y+h/2,z]);
    // Buildings rest directly on the terrace; no overlapping foundation skirt.
    for(const side of [-1,1]) {
      for(const dx of [-w/2+.13,0,w/2-.13]) box([.23,h,.22],colors.timber,[x+dx,y+h/2,z+side*(d/2+.03)]);
      for(const level of [h*.48,h-.2]) box([w+.3,.24,.22],colors.trim,[x,y+level,z+side*(d/2+.06)]);
      for(const dx of [-w*.28,w*.28]) for(const level of [2.3,h-1.6]) {
        box([1.3,1.45,.12],colors.timber,[x+dx,y+level,z+side*(d/2+.08)],false);
        box([.91,1.12,.14],'#d5b477',[x+dx,y+level,z+side*(d/2+.13)],false);
        box([.08,1.2,.17],colors.trim,[x+dx,y+level,z+side*(d/2+.15)],false);
        box([1.15,.09,.17],colors.trim,[x+dx,y+level,z+side*(d/2+.15)],false);
      }
      box([1.5,2.45,.15],colors.timber,[x,y+1.23,z+side*(d/2+.1)],false);
    }
    for(const dx of [-w/2,w/2]) {
      box([.22,h,d+.3],colors.timber,[x+dx,y+h/2,z],false).scale.y=.035;
      for(const dz of [-d/2,d/2]) box([.27,h,.27],colors.trim,[x+dx,y+h/2,z+dz]);
    }
    // Asymmetric shallow roofs and overhanging eaves echo the timber hillside silhouette.
    const rise=w*.26, run=w/2+.85, pitch=Math.atan2(rise,run);
    const gable = new THREE.BufferGeometry();
    gable.setAttribute('position', new THREE.Float32BufferAttribute([
      -w/2,0,d/2, w/2,0,d/2, 0,rise,d/2,
      w/2,0,-d/2, -w/2,0,-d/2, 0,rise,-d/2,
    ],3));
    gable.computeVertexNormals(); mesh(gable,color,[x,y+h,z]);
    for(const side of [-1,1]) {
      beam([x,y+h,z+side*(d/2+.05)],[x,y+h+rise,z+side*(d/2+.05)],.2,colors.trim);
      for(let level=.55;level<rise;level+=.6) box([w*(1-level/rise),.08,.08],colors.trim,[x,y+h+level,z+side*(d/2+.07)],false);
      // Fine vertical boards give street-level walls a timber scale.
      for(let dx=-w/2+.6;dx<w/2;dx+=.65) box([.035,h-.5,.025],'#596568',[x+dx,y+h/2+.2,z+side*(d/2+.025)],false);
    }
    for(const side of [-1,1]) {
      const panel=box([Math.hypot(run,rise),.22,d+1.8],colors.roof,[x+side*run/2,y+h+rise/2,z]); panel.rotation.z=-side*pitch;
      for(let row=1;row<6;row++) {
        const t=row/6;
        box([.1,.1,d+1.8],'#68717a',[x+side*run*t,y+h+rise*(1-t)+.14,z],false);
      }
      beam([x+side*run,y+h,z-d/2-.9],[x,y+h+rise,z-d/2-.9],.2,colors.trim);
      beam([x+side*run,y+h,z+d/2+.9],[x,y+h+rise,z+d/2+.9],.2,colors.trim);
    }
    box([.24,.24,d+2],colors.trim,[x,y+h+rise,z]);
    box([.9,2.4,.9],'#77706a',[x+w*.28,y+h+1.6,z-d*.25]);
    box([1.2,.25,1.2],colors.stone,[x+w*.28,y+h+2.8,z-d*.25]);
    // Bracketed front porch canopy.
    const canopy=box([w*.7,.15,2.5],colors.roof,[x,y+2.8,z+d/2+1]); canopy.rotation.x=.12;
    for(const dx of [-w*.3,w*.3]) beam([x+dx,y+1.7,z+d/2+.15],[x+dx,y+2.7,z+d/2+2],.16);
  }
  function tree(x,z,y,size=1) {
    cylinder(.25*size,4*size,colors.timber,[x,y+2*size,z],true,6);
    for(let i=0;i<3;i++) mesh(new THREE.ConeGeometry((2.8-i*.65)*size,3.8*size,7),['#35594c','#426b52','#577953'][i],[x,y+(3.8+i*1.7)*size,z],false);
  }
  function lantern(x,z,y=0) {
    box([.18,3.7,.18],colors.timber,[x,y+1.85,z]);
    box([.68,.12,.68],colors.timber,[x,y+3.3,z],false);
    box([.45,.6,.45],'#ffe0a0',[x,y+3.65,z],false);
    mesh(new THREE.ConeGeometry(.52,.38,4),colors.roof,[x,y+4.14,z],false).rotation.y=Math.PI/4;
    for(const a of [-.26,.26]) for(const b of [-.26,.26]) box([.05,.65,.05],colors.timber,[x+a,y+3.65,z+b],false);
  }
  function stall(x,z,y,color) {
    for(const dx of [-2,2]) for(const dz of [-1.4,1.4]) box([.14,3.2,.14],colors.trim,[x+dx,y+1.6,z+dz]);
    const cloth=box([4.6,.12,3.5],color,[x,y+3.25,z],false); cloth.rotation.x=.12;
    box([4.6,.5,.08],color,[x,y+2.87,z+1.7],false);
    box([3.9,1,.85],colors.timber,[x,y+.5,z+.85]);
    for(let i=0;i<5;i++) mesh(new THREE.SphereGeometry(.24,7,5),['#9eaa69','#d7a456','#a8775a'][i%3],[x-1.4+i*.65,y+1.2,z+.85],false);
  }
  // One connected landmass, with a narrow watercourse carved along its west side.
  const outline=[[-48,57],[-34,67],[19,65],[43,47],[54,16],[50,-39],[29,-68],[-20,-71],[-55,-44],[-57,10]];
  const shape=new THREE.Shape(); outline.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z)); shape.closePath();
  const base=mesh(new THREE.ExtrudeGeometry(shape,{depth:5,bevelEnabled:false}),'#636f70',[0,-5.5,0]); base.rotation.x=-Math.PI/2;
  // Recess grass below the paved streets; the island cap sits below both.
  box([88,.16,120],'#708069',[0,-.30,-2]).castShadow=false;
  terrace(0,42,72,34,0);
  terrace(0,9,82,32,0);
  terrace(1,-12,78,40,3);
  terrace(0,-49,64,26,6);
  // Continuous, broad approaches either side of the central market building.
  ramp(-24,27,0,8,3,9); ramp(20,27,0,8,3,8);
  terrace(32,13,16,20,3);
  ramp(0,-17,3,-37,6,12);
  ramp(35,-17,3,-37,6,7);
  terrace(34,-46,10,18,6);
  // Northern back lane and western bridge quarter.
  terrace(-35,-44.5,10,35,6); ramp(-35,-14,3,-27,6,7);
  box([5,.08,110],colors.water,[-45,.045,-1],false);
  for(const x of [-48,-42]) for(const [a,b] of [[-56,-29.5],[-24.5,.5],[5.5,33.5],[38.5,54]])
    box([.65,.55,b-a],colors.stone,[x,.15,(a+b)/2]);
  for(const z of [36,3,-27]) {
    box([12,.24,5],colors.trim,[-45,0,z]);
    for(let x=-50;x<-39;x+=.65) box([.07,.025,5],'#c09b6c',[x,.13,z],false);
    rail(-51,z-2.4,-39,z-2.4,.12); rail(-51,z+2.4,-39,z+2.4,.12);
  }
  terrace(-53,4,8,16,0); buildTerraces(); house(-53,-10,7,10,0,7,'#778784');
  box([4,.14,8],colors.water,[-45,-.1,56],false);
  box([4,21,.12],'#80cbd2',[-45,-10.5,60],false);
  for(let i=0;i<5;i++) box([.22,19,.16],'#bce1df',[-46.6+i*.8,-9.5,60.08],false);
  // Entry platform, gate and original compass medallion.
  // Raise the landing above the street where their footprints overlap.
  box([13,.5,17],colors.trim,[0,-.15,65]).castShadow=false;
  for(const x of [-7,7]) {
    box([2.3,5.8,2.3],colors.stone,[x,2.9,57]);
    box([1.7,3.5,.2],'#547b91',[x,3.1,58.25],false);
    mesh(new THREE.ConeGeometry(2.1,1.3,4),colors.roof,[x,6.4,57]).rotation.y=Math.PI/4;
  }
  for(const [r,h,c] of [[10,.045,'#6f797c'],[9.4,.06,'#c3b69b'],[8.9,.07,'#7f8d8e'],[8.4,.08,'#aaa28e']]) cylinder(r,h,c,[0,h/2,44],false,64).castShadow=false;
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    const p=box([.23,.04,i%2?3:5],'#decba4',[Math.sin(a)*4.5,.065,44+Math.cos(a)*4.5],false); p.rotation.y=a; p.castShadow=false;
  }
  const diamond=box([2.8,.1,2.8],'#547b87',[0,.09,44],false); diamond.rotation.y=Math.PI/4; diamond.castShadow=false;
  // Buildings enclosing the arrival square, with a street on each side of the inn.
  // Back edge stops just short of the retaining wall at z=8.
  house(0,14,23,11,0,7.5,'#607985');
  house(-28,43,10,19,0,7.5,'#688182'); house(-35,24,9,11,0,8,'#837e6e');
  house(31,44,10,17,0,6.5,'#956c51');
  // Two sheltered teaching stations along each side of the arrival square.
  for(const x of [-21,24]) for(const z of [39,49]) {

    box([5.4,.18,4.6],colors.roof,[x,3.2,z],false);
    for(const dz of [-2,2]) box([.18,3.2,.18],colors.trim,[x+(x<0?-2.4:2.4),1.6,z+dz]);
    box([.16,1.6,1.8],colors.timber,[x+(x<0?-1.6:1.6),.8,z],false);
    for(const dz of [-.5,0,.5]) beam([x+(x<0?-1.6:1.6),.3,z+dz],[x+(x<0?-1.6:1.6),2,z+dz],.08,colors.trim);
  }
  // One potion stall on the lower terrace beneath the former eastern forge.
  stall(30,30,0,'#796699');
  // Middle street wraps a freestanding workshop; warm west / blue east districts.
  house(-28,-4,13,12,3,8,'#8d725b'); house(-12,-5,10,9,3,6,'#7d8b81');
  house(15,-3,12,13,3,7.5,'#69818c');
  // Outdoor cell laboratory replaces the eastern terrace residence.
  // Keep the front and sides open to the existing slope and eastern lane.
  const labStart = root.children.length;
  box([9,.08,13],'#8b9696',[34,3.045,-2],false);
  for(const x of [29.6,38.4]) for(const z of [-8.2,2.8]) box([.22,3.5,.22],colors.timber,[x,4.75,z]);
  const labCanopy=box([9.4,.16,8],'#5b8f94',[34,6.55,-4],false); labCanopy.rotation.x=.06;
  box([8.8,2,.18],'#647d80',[34,4,-8.3]);
  for(const x of [30,34,38]) {
    box([2.4,.18,1.15],'#c6d0c8',[x,4.12,-5.8]);
    for(const dx of [-.9,.9]) box([.14,1.02,.75],'#43575d',[x+dx,3.53,-5.8]);
    for(let i=0;i<3;i++) {
      const bx=x-.65+i*.65;
      cylinder(.15,.4,['#75d9dd','#9da4e7','#a3c7a2'][i],[bx,4.42,-5.8],false,10);
      cylinder(.08,.14,'#cedbdd',[bx,4.69,-5.8],false,10);
    }
  }
  // Central experiment stand, containment rings, and suspended cell specimen.
  cylinder(.9,.6,'#405a63',[34,3.3,-1.3],true,12);
  cylinder(1,.12,'#a4bec2',[34,3.66,-1.3],true,16);
  mesh(new THREE.OctahedronGeometry(.42),'#8de7e3',[34,4.45,-1.3],false);
  const ring=mesh(new THREE.TorusGeometry(.75,.055,6,24),'#d9b884',[34,4.45,-1.3],false); ring.rotation.x=Math.PI/2;
  for(const x of [33.15,34.85]) box([.1,1.8,.1],'#5b757c',[x,4.1,-1.3]);
  // Copper conduits connect two outdoor reagent tanks to the rear workbench.
  for(const x of [30.2,37.8]) {
    cylinder(.48,1.7,'#516b72',[x,3.85,-2.5],true,12);
    for(const y of [3.15,4.55]) cylinder(.51,.12,'#c4ad80',[x,y,-2.5],false,12);
    box([.17,.17,2.9],'#bc9870',[x,4.3,-4],false);
    mesh(new THREE.SphereGeometry(.14,8,6),'#76e1d9',[x,4.8,-2.5],false);
  }
  box([2,.15,1],'#c6d0c8',[30.5,4.05,1.3]);
  for(const x of [29.75,31.25]) box([.14,1,.7],'#43575d',[x,3.5,1.3]);
  box([.65,.12,.5],'#ddcfaa',[30.5,4.2,1.3],false);
  const labEnd = root.children.length;
  house(-23,-21,11,12,3,7,'#7b7162');
  house(22,-25,10,10,3,7,'#607984');
  // Shared open-front smithy attached to the building behind the travel board.
  const smithyStart = root.children.length;

  for(const x of [-9,9]) for(const z of [31,37]) box([.3,4.5,.3],colors.timber,[x,2.25,z]);
  const forgeRoof=box([20,.25,7.5],colors.roof,[0,4.6,34]); forgeRoof.rotation.x=.12;
  box([2.5,8,2.2],'#65666b',[7,4,32]);
  box([3,2.4,1.6],colors.stone,[7,1.2,33]);
  box([1.8,1.5,.12],'#ef9d4d',[7,1,33.85],false);
  box([2.6,.55,1.2],'#414b53',[-5,1.05,32.5]); box([1,1,1],colors.stone,[-5,.5,32.5]);
  box([2.8,1,.8],colors.timber,[2,.5,32.5]);
  for(const piece of root.children.slice(smithyStart)) piece.position.z -= 11;
  // Refugee reception occupies the former eastern smithy terrace.
  // Keep its front open and the eastern through-lane clear.
  for(const x of [25,35]) for(const z of [13,21]) box([.22,3.5,.22],colors.timber,[x,4.75,z]);
  const refugeRoof=box([11,.18,9], '#8c9478',[30,6.6,17],false); refugeRoof.rotation.x=.10;
  box([10,2.5,.12],'#8c9478',[30,4.25,12.8],false);
  for(const x of [27,31]) {
    box([2.4,.35,1.2],colors.timber,[x,3.175,14]);
    box([2.2,.12,1], '#aa9c7f',[x,3.41,14],false);
  }
  box([2.6,.8,.8],colors.timber,[33,3.4,16]);
  for(const x of [26.5,28]) {
    box([1.1,1.1,1.1],colors.trim,[x,3.55,17]);
    beam([x-.5,3.1,17.56],[x+.5,4,17.56],.08);
    mesh(new THREE.SphereGeometry(.4,8,6),'#b2a68b',[x,4.3,17],false);
  }
  cylinder(.5,1.2,colors.timber,[34,3.6,18]);
  for(const y of [3.2,4]) cylinder(.52,.06,'#7c8585',[34,y,18],false);
  // Civic terrace has a clear central approach, basin, hall and a narrow watchtower.
  house(0,-58,20,9,6,9,'#7e8a88');
  house(-22,-53,10,12,6,8,'#8c745c'); house(23,-52,10,13,6,8,'#777f7d');
  cylinder(3,.45,colors.stone,[0,6.225,-46]); cylinder(2.6,.08,colors.water,[0,6.49,-46],false);
  cylinder(.6,2.4,colors.stone,[0,7.2,-46]);
  mesh(new THREE.OctahedronGeometry(.8),'#81c5ce',[0,8.9,-46],false);
  house(12,-58,4.5,5,6,20,'#697b80');
  cylinder(1.1,.14,'#d4c39a',[12,22.7,-55.4],false).rotation.x=Math.PI/2;
  box([.1,1.2,.1],colors.timber,[12,23,-55.27],false);
  box([.65,.1,.1],colors.timber,[12.28,22.7,-55.27],false);
  for(const x of [-7,7]) box([1.8,4,.12],'#567e95',[x,12,-53.35],false);
  // Overlooks and planted edges guide movement without closing the town off.
  rail(-31.8,-36,-6.3,-36,6); rail(6.3,-36,30,-36,6);
  rail(-38,8,-29,8,3); rail(-18,8,-7,8,3);
  for(const [x,z,y] of [[-16,35,0],[14,35,0],[-17,52,0],[14,52,0],[-17,0,3],[23,1,3],[-9,-15,3],[9,-15,3],[-12,-40,6],[12,-40,6],[-32,-39,6],[34,-39,6]]) lantern(x,z,y);
  for(const [x,z,y,k] of [[-38,49,0,1],[-38,20,0,.8],[-38,-6,3,.9],[42,35,0,1.2],[44,8,0,1.3],[44,-29,0,1.6],[-39,-57,6,1.2],[-12,-66,6,1.3],[32,-65,6,1.2]]) tree(x,z,y,k);
  // Hillside silhouette: terraced residences above and outside the playable streets.
  for(const side of [-1,1]) for(let i=0;i<6;i++) {
    const x=side*(51+(i%2)*7+(side===-1 && i===1?8:0)), z=20-i*16, y=5+i*1.7;
    box([13,y+6,15],'#738076',[x,(y-6)/2,z]);
    house(x,z,8+(i%2)*2,9,y,5+i%3,['#8b7869','#738385','#93765e'][i%3]);
    tree(x+side*5,z-5,y,.9);
    const rock=mesh(new THREE.DodecahedronGeometry(8,0),'#6d797e',[x+side*6,y-7,z],false); rock.scale.set(1,1.8,1);
  }
  for(let i=0;i<9;i++) {
    const x=-49+i*12,y=12+(i%3)*3,z=-76-(i%2)*5;
    box([13,y+5,14],'#737e78',[x,(y-5)/2,z]); house(x,z,8,8,y,6,'#857466'); tree(x+4,z-5,y,1.3);
  }
  // Supply crates and barrels give the corners scale, kept out of circulation.
  for(const [x,z,y] of [[-20,29,0],[13,29,0],[-37,9,0],[38,19,3],[-19,-60,6],[29,-59,6]]) {
    box([1.3,1.3,1.3],colors.trim,[x,y+.65,z]);
    beam([x-.6,y+.1,z+.67],[x+.6,y+1.2,z+.67],.09);
    cylinder(.55,1.25,colors.timber,[x+1.7,y+.625,z],true);
    for(const h of [.2,1]) cylinder(.57,.07,'#7c8585',[x+1.7,y+h,z],false);
  }
  const positions={ 'cell-researcher':[32,3,3.5], extractor:[36,3,3.5], donation:[23,3,0], 'arena-travel':[0,0,39], guide:[-5,0,49], smith:[-5,0,24], armorer:[3,0,24], potions:[30,0,32.5], sword:[-21,0,39], repeaters:[-21,0,49], chains:[24,0,39], 'future-master':[24,0,49], refugee:[30,3,19], travel:[5,0,55] };
  const stations=OLD_TOWN_STATIONS.map(s=>({...s,position:positions[s.id]}));
  stations.find(s=>s.id==='guide').text='Welcome to Old Emberwatch. The market lanes climb around the old inn to the watchtower courtyard. Cross the western stream to explore the bridge quarter, visit the smithy behind the travel board, or meet the weapon masters on either side of the arrival square.';
  for(const s of stations) if(!['travel','arena-travel','extractor','donation'].includes(s.id)) {
    cylinder(.34,1.1,s.color,[s.position[0],s.position[1]+.85,s.position[2]],true,8);
    mesh(new THREE.SphereGeometry(.25,8,6),'#c9ad8a',[s.position[0],s.position[1]+1.65,s.position[2]]);
  }
  // Donation desk beside the east wall of the enclosed building west of the cell lab.
  box([1.7,.9,.9],'#8c6943',[23,3.45,0]);
  box([1.9,.12,1.1],'#dfbb71',[23,3.96,0]);
  // Extractor beside the outdoor laboratory, clear of the eastern through-lane.
  cylinder(.8,.65,'#344654',[36,3.325,3.5],true,12);
  cylinder(.38,1.15,'#72dfec',[36,4.2,3.5],true,12);
  cylinder(.65,.2,'#344654',[36,4.88,3.5],true,12);
  for(const x of [35.45,36.55]) box([.12,1.3,.12],'#637b85',[x,4.2,3.5]);
  // Visible travel board beside the arrival medallion.
  for(const x of [-.9,.9]) box([.14,2.2,.14],colors.timber,[x,1.1,39]);
  box([2.3,1.25,.18],colors.trim,[0,1.5,39]);
  box([1.9,.9,.05],'#99c4c2',[0,1.5,39.12],false);
  // Merge static meshes by material and collision policy.
  root.updateMatrixWorld(true);
  const batches=new Map();
  root.traverse(o=>{
    if(!o.isMesh)return;
    const key=`${o.material.uuid}:${o.castShadow}:${o.userData.movementCollision}:${Object.keys(o.geometry.attributes).sort().join(',')}`;
    if(!batches.has(key))batches.set(key,[]); batches.get(key).push(o);
  });
  for(const objects of batches.values()) {
    const geometries=objects.map(o=>(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld));
    const combined=new THREE.Mesh(mergeGeometries(geometries),objects[0].material);
    combined.userData.movementCollision=objects[0].userData.movementCollision;
    combined.castShadow=objects[0].castShadow; combined.receiveShadow=true;
    for(const o of objects){o.removeFromParent();o.geometry.dispose();} for(const g of geometries)g.dispose(); root.add(combined);
  }
  root.visible=false;
  return {root,stations};
}

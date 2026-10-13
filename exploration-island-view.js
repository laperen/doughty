import * as THREE from 'three';

/** Broad flat territories, continuous sloping bridges, and nonblocking biome scenery. */
export function createExplorationIslandView(island) {
  const root = new THREE.Group(); root.name = island.name;
  const materials = island.palette.map(color => new THREE.MeshStandardMaterial({color, roughness:.95}));
  const [ground, rock, path, bark, foliage] = materials;
  path.polygonOffset=true;path.polygonOffsetFactor=-2;path.polygonOffsetUnits=-2;
  const glow = new THREE.MeshStandardMaterial({color: island.theme === 'volcanic' ? '#ff8a32' : '#74dce6', emissive: island.theme === 'volcanic' ? '#d94c12' : '#287c99', emissiveIntensity:.65});
  const add = (geometry, material, p, solid = true) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...p);
    mesh.userData.movementCollision = solid; mesh.castShadow = solid; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const land = (p,r) => {
    add(new THREE.CylinderGeometry(r,r*.72,12,18),rock,[p[0],p[1]-6.15,p[2]],false).castShadow=false;
    add(new THREE.CylinderGeometry(r,r,.3,48),ground,[p[0],p[1]-.15,p[2]]).castShadow=false;
  };
  const bridge = (a,b,width=14) => {
    const dx=b[0]-a[0], dz=b[2]-a[2], horizontal=Math.hypot(dx,dz);
    const slope=(b[1]-a[1])/horizontal;
    // Extruded sloping deck with an exact top plane through both endpoints.
    const shape=new THREE.Shape(); shape.moveTo(-width/2,-.7);shape.lineTo(width/2,-.7);shape.lineTo(width/2,0);shape.lineTo(-width/2,0);shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:horizontal,bevelEnabled:false,steps:1});
    const pos=g.attributes.position;
    for(let i=0;i<pos.count;i++)pos.setY(i,pos.getY(i)+slope*pos.getZ(i));
    g.computeVertexNormals();
    // Store baked vertices, not ExtrudeGeometry parameters (which describe a flat deck).
    const baked = new THREE.BufferGeometry().copy(g); g.dispose();
    const m=add(baked,path,a);m.rotation.y=Math.atan2(dx,dz);m.castShadow=false;
    // Natural land shoulders and deep stone beneath the trail join territories
    // into an island rather than leaving narrow unsupported walkways.
    const shoulder=baked.clone();const v=shoulder.attributes.position;
    for(let i=0;i<v.count;i++){v.setX(i,v.getX(i)*2.2);v.setY(i,v.getY(i)-.12);}
    shoulder.computeVertexNormals();
    const bank=add(shoulder,ground,a);bank.rotation.y=m.rotation.y;bank.castShadow=false;
    const skirt=shoulder.clone();const q=skirt.attributes.position;
    for(let i=0;i<q.count;i++)q.setY(i,q.getY(i)-4);
    skirt.computeVertexNormals();
    const foundation=add(skirt,rock,a,false);foundation.scale.y=1;foundation.rotation.y=m.rotation.y;foundation.castShadow=false;
  };
  const arrival=[0,0,100];land(arrival,22);
  const edges=island.links.map(([a,b])=>[island.arenas[a].center,island.arenas[b].center]);
  edges.push([arrival,island.arenas[0].center],[arrival,island.arenas[island.theme==='volcanic'?3:island.arenas.length-1].center]);
  const nearPath=(x,z)=>edges.some(([a,b])=>{const dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t)<12;});
  for(const [index,arena] of island.arenas.entries()) {
    const p=arena.center;land(p,arena.radius+9);
    add(new THREE.CylinderGeometry(arena.radius,arena.radius,.04,48),path,[p[0],p[1]+.02,p[2]],false).castShadow=false;
    for(let j=0;j<18;j++) {
      const angle=j*Math.PI/9+.07*Math.sin(j*7+index), r=arena.radius+4+j%3, x=p[0]+Math.sin(angle)*r,z=p[2]+Math.cos(angle)*r;
      if(nearPath(x,z))continue;
      if(island.theme==='woodland'||island.theme==='frozen') {
        add(new THREE.CylinderGeometry(.55,.9,6,6),bark,[x,p[1]+3,z]);
        const tree=add(island.theme==='frozen'?new THREE.ConeGeometry(3.5,10,7):new THREE.IcosahedronGeometry(4,1),foliage,[x,p[1]+8,z],false);
        tree.scale.y=island.theme==='woodland'?1.25:1;
      } else {
        const pillar=add(new THREE.CylinderGeometry(1.5,2.2,4+j%4*2,6),rock,[x,p[1]+2+j%4,z]);
        if(j%3===0)add(new THREE.OctahedronGeometry(1.2),glow,[x,pillar.position.y+3,z],false);
      }
      if(j%3===1){const outcrop=add(new THREE.DodecahedronGeometry(2+j%4,0),rock,[x,p[1]+.8,z]);outcrop.scale.set(1.2,.7,1);}
    }
    // Arena-specific landmarks sit outside the combat clearing and route mouths.
    const x=p[0],z=p[2]-arena.radius-5,y=p[1];
    if(!nearPath(x,z)) {
      if(island.theme==='volcanic') {
        add(new THREE.CylinderGeometry(4,5,9,10,true),bark,[x,y+4.5,z]);
        add(new THREE.CylinderGeometry(3.5,3.5,.2,16),glow,[x,y+.1,z],false);
      } else if(island.theme==='frozen' && index===2) {
        add(new THREE.BoxGeometry(9,10,5),rock,[x,y+5,z]);
        add(new THREE.ConeGeometry(7,5,4),foliage,[x,y+12,z]);
      }
    }
  }
  edges.forEach(([a,b])=>{
    if(a[1]===b[1]) { bridge(a,b); return; }
    const length=Math.hypot(b[0]-a[0],b[2]-a[2]);
    const radius=p=>p===arrival?22:island.arenas.find(arena=>arena.center===p).radius+9;
    const point=(distance,y)=>[a[0]+(b[0]-a[0])*distance/length,y,a[2]+(b[2]-a[2])*distance/length];
    // Finish the incline before the raised island's vertical cliff face.
    const start=point(radius(a)+1,a[1]),end=point(length-radius(b)-1,b[1]);
    bridge(a,start);bridge(start,end);bridge(end,b);
  });
  // Central landmark is scenery on its own outcrop, clear of traversal routes.
  const landmark=[0,island.theme==='volcanic'?-10:0,-10];
  if(island.theme==='woodland') {
    land(landmark,12);
    for(const side of [-1,1]){const t=add(new THREE.CylinderGeometry(1.7,3.2,24,7),bark,[side*3,12,-10]);t.rotation.z=side*-.16;add(new THREE.IcosahedronGeometry(9,1),foliage,[side*7,26,-10],false);}
  } else if(island.theme==='highlands') {
    land(landmark,14);const spire=add(new THREE.ConeGeometry(9,40,5),rock,[0,20,-10]);spire.rotation.z=.12;
    add(new THREE.OctahedronGeometry(4),glow,[0,35,-10],false);
  } else if(island.theme==='frozen') {
    add(new THREE.BoxGeometry(15,25,5),glow,[0,-4,-125],false);
    for(let i=0;i<7;i++)add(new THREE.ConeGeometry(2,14+i%3*3,5),foliage,[-9+i*3,-8,-122],false);
  } else {
    add(new THREE.CylinderGeometry(12,18,34,8,true),rock,[0,7,-110]);
    add(new THREE.TorusGeometry(12,1.3,6,8),glow,[0,20,-110],false).rotation.x=Math.PI/2;
  }
  // Arrival beacon is offset from the route, leaving the spawn unobstructed.
  add(new THREE.CylinderGeometry(1,1.5,3,8),rock,[0,1.5,113]);
  add(new THREE.OctahedronGeometry(1.3),glow,[0,4,113],false);
  root.visible=false;
  return root;
}

// Population is deliberately disabled until these locations receive authored rosters.
const define = (id, name, theme, names, centers, links, palette) => Object.freeze({
  id, name, theme, roster: Object.freeze([]), maxAlive: 0, arrival: [0, 0.15, 100],
  arenas: names.map((name, i) => ({ id: `${id}-${i}`, name, center: centers[i], radius: 25 + i % 2 * 3 })),
  links, palette,
});
export const EXPLORATION_ISLANDS = Object.freeze({
  'brackenlight': define('brackenlight', 'Brackenlight Reach', 'woodland',
    ['Brook Meadow', 'Whitebank Hollow', 'Splitroot Green'],
    [[-55,0,25],[0,0,-65],[60,0,20]], [[0,1],[1,2],[2,0]],
    ['#819751','#ded5b8','#bbaa7b','#664f35','#426a3c']),
  'thunderstep': define('thunderstep', 'Thunderstep Highlands', 'highlands',
    ['Coppergrass Bowl','Broken Ring','Stormwash Basin','Spire Terrace'],
    [[-60,0,35],[-65,6,-55],[50,6,-65],[65,0,35]], [[0,1],[1,2],[2,3],[3,0]],
    ['#a88951','#4b535e','#8c8072','#514746','#3e5550']),
  'rimewatch': define('rimewatch', 'Rimewatch Expanse', 'frozen',
    ['Whitepine Basin','Frozen Spillway','Watch Station Yard','Blueice Hollow','Crown Shelf'],
    [[-65,0,40],[-95,4,-40],[0,8,-85],[90,4,-35],[65,0,45]], [[0,1],[1,2],[2,3],[3,4],[4,0],[0,2]],
    ['#d4e5e7','#445d73','#a0c6d7','#556171','#dcebf0']),
  'cinderfall': define('cinderfall','Cinderfall Crucible','volcanic',
    ['Ash Orchard','Kiln Yard','Obsidian Basin','Broken Aqueduct','Ventfield','Furnace Heart'],
    [[-95,6,60],[-105,6,-85],[90,6,-85],[100,6,55],[-35,0,-10],[30,0,-15]],
    [[0,1],[1,2],[2,3],[3,0],[0,4],[4,5],[5,2]],
    ['#686268','#302f39','#968783','#4d4142','#b3b0aa']),
});

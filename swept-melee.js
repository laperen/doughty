/** Sweep a target relative to an attack origin through the authored melee sector.
 * Split at its circle, wedge and height boundaries, so fast travel cannot tunnel.
 * Target radius follows the existing melee rule: it expands reach, not the arc.
 */
export function sweptMeleeContact(move, yaw, from, to, targetFrom, targetTo = targetFrom, radius = 0, height = 1.5) {
  const local = (origin, target) => {
    const dx = target[0] - origin[0], dz = target[2] - origin[2];
    return [dx * Math.cos(yaw) - dz * Math.sin(yaw), target[1] - origin[1], -dx * Math.sin(yaw) - dz * Math.cos(yaw)];
  };
  const a = local(from, targetFrom), b = local(to, targetTo);
  const d = b.map((v, i) => v - a[i]);
  const reach = move.range + radius, halfArc = move.arc * Math.PI / 360;
  const cuts = [0, 1];
  const cut = (t) => { if (t > 0 && t < 1) cuts.push(t); };
  const A = d[0] ** 2 + d[2] ** 2;
  const B = 2 * (a[0] * d[0] + a[2] * d[2]);
  const C = a[0] ** 2 + a[2] ** 2 - reach ** 2;
  const discriminant = B * B - 4 * A * C;
  if (A > 0 && discriminant >= 0) {
    cut((-B - Math.sqrt(discriminant)) / (2 * A));
    cut((-B + Math.sqrt(discriminant)) / (2 * A));
  }
  for (const side of [-1, 1]) {
    const numerator = a[0] * Math.cos(halfArc) + side * a[2] * Math.sin(halfArc);
    const denominator = d[0] * Math.cos(halfArc) + side * d[2] * Math.sin(halfArc);
    if (denominator !== 0) cut(-numerator / denominator);
    if (d[1] !== 0) cut((side * height - a[1]) / d[1]);
  }
  cuts.sort((x, y) => x - y);
  const inside = (t) => {
    const x = a[0] + d[0] * t, y = a[1] + d[1] * t, z = a[2] + d[2] * t;
    const distance = Math.hypot(x, z);
    return Math.abs(y) <= height + 1e-9 && distance <= reach + 1e-9
      && (distance < 1e-9 || z / distance >= Math.cos(halfArc) - 1e-9);
  };
  return cuts.some((t, i) => inside(t) || (i > 0 && inside((cuts[i - 1] + t) / 2)));
}

/** The broad body volume is a fallback, not an occluder for its own authored parts.
 * World obstacles and other targets still stop the ray before a more specific part.
 */
export function selectRepeaterRayHit(hits, records) {
  const first = hits[0];
  if (!first || first.object.userData?.part !== 'body') return first;
  const body = records.find(record => record.mesh === first.object);
  if (!body) return first;
  for (const hit of hits.slice(1)) {
    const record = records.find(record => record.mesh === hit.object);
    if (!record || record.id !== body.id) break;
    if (hit.object.userData?.part && hit.object.userData.part !== 'body') return hit;
  }
  return first;
}

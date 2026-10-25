// Fixed map properties; no player overrides or environment save state.
export function defineEnvironment(values = {}) {
  return Object.freeze({
    skyTop: '#438da9', skyHorizon: '#c5ded6',
    cloudColor: '#f3eee3', cloudShadow: '#97adb8', clouds: .45,
    cloudScale: 3.2, cloudStretch: 1, cloudSoftness: .18,
    wind: .35, windDirection: 90,
    sunAngle: 145, sunlight: 3.2, sunColor: '#fff0d9',
    ambient: 1.9, ambientColor: '#dbe8ec', groundColor: '#535c58',
    rimColor: '#a2c8ff', rimIntensity: 1.2,
    fogColor: '#c5ded6', fog: .35, fogDistance: 440, fogDepth: 360,
    ...values,
  });
}

export const RANGE_MAP = Object.freeze({
  id: 'range',
  environment: defineEnvironment({ fogDistance: 150, fogDepth: 180 }),
});

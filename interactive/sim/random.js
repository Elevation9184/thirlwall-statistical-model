// Xoshiro128** with SplitMix32 seeding. One stream belongs to one simulation run.
const UINT32_SCALE = 1 / 0x100000000;
const rotl = (value, bits) => (value << bits) | (value >>> (32 - bits));

export function createRng(seed) {
  if (!Number.isInteger(seed)) throw new RangeError('The simulation seed must be an integer');
  let seedState = seed >>> 0;
  const splitmix32 = () => {
    seedState = (seedState + 0x9e3779b9) >>> 0;
    let value = seedState;
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
    return (value ^ (value >>> 16)) >>> 0;
  };
  let a = splitmix32(), b = splitmix32(), c = splitmix32(), d = splitmix32();
  let spareNormal = null;
  const nextUint = () => {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const temp = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= temp; d = rotl(d, 11);
    return result;
  };
  const uniform = () => (nextUint() + 0.5) * UINT32_SCALE;
  const normal = () => {
    if (spareNormal !== null) {
      const value = spareNormal;
      spareNormal = null;
      return value;
    }
    const radius = Math.sqrt(-2 * Math.log(uniform()));
    const angle = 2 * Math.PI * uniform();
    spareNormal = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
  return { nextUint, uniform, normal };
}

import assert from "node:assert/strict";
import { compositeWithMatte, neutralizePortraits, preparePortraitBackground } from "../server/portrait-background.mjs";

const rgb = Buffer.from([10, 30, 90, 21, 42, 84, 0, 127, 255, 255, 0, 100]);
const matte = Buffer.from([0, 255, 128, 64]);
const result = compositeWithMatte({ rgb, matte, width: 2, height: 2 });
assert.deepEqual(result.subarray(0, 3), Buffer.from([212, 212, 212]));
assert.deepEqual(result.subarray(3, 6), rgb.subarray(3, 6));
for (let pixel = 0; pixel < 4; pixel += 1) {
  for (let channel = 0; channel < 3; channel += 1) {
    const offset = pixel * 3 + channel;
    assert.equal(result[offset], Math.round((rgb[offset] * matte[pixel] + 212 * (255 - matte[pixel])) / 255));
  }
}
assert.deepEqual(rgb, Buffer.from([10, 30, 90, 21, 42, 84, 0, 127, 255, 255, 0, 100]));
assert.throws(() => compositeWithMatte({ rgb, matte, width: 0, height: 2 }), /Dimensions/);
assert.throws(() => compositeWithMatte({ rgb, matte, width: 2, height: 1.5 }), /Dimensions/);
assert.throws(() => compositeWithMatte({ rgb, matte: Buffer.alloc(1), width: 2, height: 2 }), /Pixels/);
assert.throws(() => compositeWithMatte({ rgb: Buffer.alloc(1), matte, width: 2, height: 2 }), /Pixels/);

const previousMode = process.env.PORTRAIT_BACKGROUND_MODE;
try {
  process.env.PORTRAIT_BACKGROUND_MODE = "original";
  assert.deepEqual(await preparePortraitBackground(), { enabled: false, ready: false });
  const buffers = [Buffer.from("portrait-a"), Buffer.from("portrait-b")];
  const preserved = await neutralizePortraits(buffers);
  assert.equal(preserved.backgroundTreatment, "original");
  assert.equal(preserved.buffers, buffers);
  assert.equal(preserved.buffers[1], buffers[1]);

  process.env.PORTRAIT_BACKGROUND_MODE = "gray";
  const invalidBatch = [Buffer.from("original-a"), Buffer.alloc(0)];
  const rejected = await neutralizePortraits(invalidBatch);
  assert.equal(rejected.backgroundTreatment, "original");
  assert.equal(rejected.buffers, invalidBatch);
  assert.equal(rejected.buffers[0], invalidBatch[0]);
} finally {
  if (previousMode === undefined) delete process.env.PORTRAIT_BACKGROUND_MODE;
  else process.env.PORTRAIT_BACKGROUND_MODE = previousMode;
}

console.log(JSON.stringify({ ok: true, checks: ["gris_exact", "pixels_opaques_conserves", "alpha_douce_et_coordonnees", "source_inchangee", "dimensions_et_buffers_invalides", "mode_original_sans_runtime", "fallback_atomique_entree_invalide"], imageGenerationCalls: 0 }));

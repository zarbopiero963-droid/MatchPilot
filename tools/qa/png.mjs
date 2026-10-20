// Minimal PNG codec for the visual baselines (QA-V): decodes the 8-bit RGB/RGBA, non-interlaced PNGs that Chromium writes
// and encodes RGBA images for the diff. Node's zlib only: no new dependency.
import {deflateSync, inflateSync} from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buffer => {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// Returns {width, height, data}: data is RGBA, 4 bytes per pixel, row after row.
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');
  let offset = 8, header = null;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (body.length !== length) throw new Error('truncated PNG chunk');
    if (type === 'IHDR') header = {width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12]};
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!header) throw new Error('PNG without header');
  if (header.depth !== 8 || ![2, 6].includes(header.color) || header.interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${header.depth}, color type ${header.color}, interlace ${header.interlace})`);
  }
  const channels = header.color === 6 ? 4 : 3;
  const stride = header.width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * header.height) throw new Error('PNG data does not match its size');
  const rows = Buffer.alloc(stride * header.height);
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = up ? up[x] : 0;
      const c = up && x >= channels ? up[x - channels] : 0;
      let predictor;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else throw new Error(`unknown PNG filter ${filter}`);
      out[x] = (line[x] + predictor) & 0xff;
    }
  }
  if (channels === 4) return {width: header.width, height: header.height, data: rows};
  const data = Buffer.alloc(header.width * header.height * 4);
  for (let i = 0, j = 0; i < rows.length; i += 3, j += 4) {
    data[j] = rows[i]; data[j + 1] = rows[i + 1]; data[j + 2] = rows[i + 2]; data[j + 3] = 255;
  }
  return {width: header.width, height: header.height, data};
}

export function encodePng({width, height, data}) {
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// A pixel differs when one of its colour channels moves by more than `pixel` (0-255). The images match when the share
// of differing pixels is at most `ratio`. The diff image shows the baseline dimmed and every differing pixel in red.
export function comparePng(baseline, actual, {pixel, ratio}) {
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    return {match: false, reason: `size ${actual.width}×${actual.height} instead of ${baseline.width}×${baseline.height}`, differing: null, share: null, diff: null};
  }
  const diff = Buffer.alloc(baseline.data.length);
  let differing = 0;
  for (let i = 0; i < baseline.data.length; i += 4) {
    const delta = Math.max(Math.abs(baseline.data[i] - actual.data[i]), Math.abs(baseline.data[i + 1] - actual.data[i + 1]),
      Math.abs(baseline.data[i + 2] - actual.data[i + 2]), Math.abs(baseline.data[i + 3] - actual.data[i + 3]));
    if (delta > pixel) {
      differing++;
      diff[i] = 255; diff[i + 1] = 0; diff[i + 2] = 0;
    } else {
      const grey = Math.round((baseline.data[i] + baseline.data[i + 1] + baseline.data[i + 2]) / 3 * 0.35);
      diff[i] = grey; diff[i + 1] = grey; diff[i + 2] = grey;
    }
    diff[i + 3] = 255;
  }
  const share = differing / (baseline.width * baseline.height);
  return {match: share <= ratio, reason: share <= ratio ? null : `${differing} differing pixels (${(share * 100).toFixed(3)}%) over the threshold of ${(ratio * 100).toFixed(3)}%`,
    differing, share, diff: {width: baseline.width, height: baseline.height, data: diff}};
}

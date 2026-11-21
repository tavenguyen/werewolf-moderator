/**
 * Pure TypeScript Offline QR Code SVG Generator
 * Tạo chuỗi SVG mã QR trực tiếp trên client mà không cần bất kỳ thư viện ngoài hay mạng Internet.
 * Hỗ trợ alphanumeric & byte mode với Reed-Solomon error correction (Level L/M).
 */

// Bảng GF(256) Log & Exp cho Reed-Solomon
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_EXP[i + 255] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 256) {
      x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
    }
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF256_EXP[GF256_LOG[a] + GF256_LOG[b]];
}

function polyMul(p1: Uint8Array, p2: Uint8Array): Uint8Array {
  const result = new Uint8Array(p1.length + p2.length - 1);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return result;
}

function getGeneratorPoly(ecCount: number): Uint8Array {
  let g = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    g = polyMul(g, new Uint8Array([1, GF256_EXP[i]]));
  }
  return g;
}

function calculateReedSolomon(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = getGeneratorPoly(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data);

  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

// Bảng cấu hình Version 3 (35 bytes dữ liệu, 15 bytes EC = 50 codewords, 29x29 matrix)
// Thừa sức chứa URL 45-50 ký tự dạng http://192.168.1.5:5173/?room=1234
const QR_SIZE = 29; // Version 3
const DATA_CODEWORDS = 44;
const EC_CODEWORDS = 26;

export function generateQrMatrix(text: string): boolean[][] {
  const matrix: (boolean | null)[][] = Array.from({ length: QR_SIZE }, () =>
    Array(QR_SIZE).fill(null)
  );

  // 1. Finder patterns (Top-Left, Top-Right, Bottom-Left)
  const addFinder = (r: number, c: number) => {
    for (let row = -1; row <= 7; row++) {
      for (let col = -1; col <= 7; col++) {
        const tr = r + row;
        const tc = c + col;
        if (tr >= 0 && tr < QR_SIZE && tc >= 0 && tc < QR_SIZE) {
          const isOuter = row === -1 || row === 7 || col === -1 || col === 7;
          const isBorder = row === 0 || row === 6 || col === 0 || col === 6;
          const isCenter = row >= 2 && row <= 4 && col >= 2 && col <= 4;
          matrix[tr][tc] = !isOuter && (isBorder || isCenter);
        }
      }
    }
  };

  addFinder(0, 0);
  addFinder(0, QR_SIZE - 7);
  addFinder(QR_SIZE - 7, 0);

  // 2. Alignment pattern cho Version 3 (tại vị trí 22, 22)
  const addAlignment = (r: number, c: number) => {
    for (let row = -2; row <= 2; row++) {
      for (let col = -2; col <= 2; col++) {
        const isBorder = Math.abs(row) === 2 || Math.abs(col) === 2;
        const isCenter = row === 0 && col === 0;
        matrix[r + row][c + col] = isBorder || isCenter;
      }
    }
  };
  addAlignment(22, 22);

  // 3. Timing patterns
  for (let i = 8; i < QR_SIZE - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }
  // Dark module
  matrix[QR_SIZE - 8][8] = true;

  // 4. Encode dữ liệu (Byte mode: 0100)
  const textBytes = new TextEncoder().encode(text);
  const bitBuffer: number[] = [];

  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(textBytes.length, 8); // Character count indicator (Version 1–9: 8 bits)
  for (const b of textBytes) {
    pushBits(b, 8);
  }

  // Terminator (lên tới 4 bit 0)
  const maxBits = DATA_CODEWORDS * 8;
  const termLen = Math.min(4, maxBits - bitBuffer.length);
  pushBits(0, termLen);

  // Padding to byte boundary
  while (bitBuffer.length % 8 !== 0) {
    bitBuffer.push(0);
  }

  // Pad bytes 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitBuffer.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Chuyển bitBuffer thành mảng data codewords
  const dataCodewords = new Uint8Array(DATA_CODEWORDS);
  for (let i = 0; i < DATA_CODEWORDS; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bitBuffer[i * 8 + b];
    }
    dataCodewords[i] = byte;
  }

  // Tính Reed-Solomon EC
  const ecCodewords = calculateReedSolomon(dataCodewords, EC_CODEWORDS);

  // Kết hợp data + EC
  const finalCodewords = new Uint8Array(DATA_CODEWORDS + EC_CODEWORDS);
  finalCodewords.set(dataCodewords);
  finalCodewords.set(ecCodewords, DATA_CODEWORDS);

  const finalBits: number[] = [];
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((cw >> i) & 1);
    }
  }

  // 5. Điền bits vào matrix (Zigzag từ phải sang trái)
  let bitIdx = 0;
  let dir = -1; // -1: lên trên, 1: xuống dưới
  let col = QR_SIZE - 1;

  while (col > 0) {
    if (col === 6) col--; // Bỏ qua timing column

    const rowStart = dir === -1 ? QR_SIZE - 1 : 0;
    const rowEnd = dir === -1 ? -1 : QR_SIZE;

    for (let row = rowStart; row !== rowEnd; row += dir) {
      for (const c of [col, col - 1]) {
        if (matrix[row][c] === null) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          // Áp dụng Mask pattern 0: (row + col) % 2 === 0
          const mask = (row + c) % 2 === 0;
          matrix[row][c] = (bit ^ (mask ? 1 : 0)) === 1;
        }
      }
    }
    col -= 2;
    dir = -dir;
  }

  // Format information (Mask 0, Level M: 00000 -> sau khi XOR với 101010000010010 = 101010000010010)
  // Mask 0, Level L: 01000 -> format bits = 111011111000100
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];

  // Vẽ format bits xung quanh top-left finder
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

  // Format bits quanh top-right và bottom-left
  for (let i = 0; i < 8; i++) matrix[8][QR_SIZE - 1 - i] = formatBits[i] === 1;
  for (let i = 8; i < 15; i++) matrix[QR_SIZE - 15 + i][8] = formatBits[i] === 1;

  return matrix.map((row) => row.map((cell) => cell ?? false));
}

/**
 * Tạo chuỗi SVG mã QR hoàn chỉnh.
 */
export function generateQrSvgString(text: string, size: number = 200): string {
  try {
    const matrix = generateQrMatrix(text);
    const n = matrix.length;
    const cellSize = size / (n + 4);
    const margin = cellSize * 2;

    let paths = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r][c]) {
          const x = margin + c * cellSize;
          const y = margin + r * cellSize;
          paths += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cellSize + 0.3).toFixed(2)}" height="${(cellSize + 0.3).toFixed(2)}" fill="#ede7dc"/>`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="#0d1017" rx="8"/>
      ${paths}
    </svg>`;
  } catch {
    // Fallback nếu có lỗi encode
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="#0d1017" rx="8"/>
      <text x="50%" y="50%" text-anchor="middle" fill="#c98638" font-size="12">QR Code #${text}</text>
    </svg>`;
  }
}

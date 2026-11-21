import { describe, expect, it } from 'bun:test';
import { generateQrMatrix, generateQrSvgString } from '../qrCodeSvg';

describe('Offline QR Code SVG Generator', () => {
  it('tạo matrix QR hợp lệ với các finder pattern', () => {
    const matrix = generateQrMatrix('http://localhost:5173/?room=7290');
    expect(matrix).toBeDefined();
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix[0].length).toBe(matrix.length);

    // Kiểm tra finder pattern góc trên bên trái
    expect(matrix[1][1]).toBe(true);
    expect(matrix[1][7]).toBe(true);
    expect(matrix[7][1]).toBe(true);
  });

  it('tạo chuỗi SVG hoàn chỉnh chứa rect và thuộc tính kích thước', () => {
    const svg = generateQrSvgString('http://192.168.1.100:5173/?room=1234', 200);
    expect(typeof svg).toBe('string');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="200"');
    expect(svg).toContain('<rect');
  });

  it('hoạt động 100% offline không cần mạng hay external API', () => {
    const svg = generateQrSvgString('offline-test-text', 150);
    expect(svg).not.toContain('api.qrserver.com');
    expect(svg.length).toBeGreaterThan(100);
  });
});

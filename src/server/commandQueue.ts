/**
 * Room Command Queue:
 * Đảm bảo các action/vote gửi đến cùng lúc từ nhiều client trong một phòng
 * được xử lý tuần tự (FIFO), loại bỏ race conditions ở tầng Node process.
 * Kết hợp với validation trạng thái trong Engine để từ chối lệnh trùng lặp.
 */
export class CommandQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = false;

  public async enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });

      void this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      while (this.queue.length > 0) {
        const nextTask = this.queue.shift();
        if (nextTask) {
          try {
            await nextTask();
          } catch {
            // Lỗi đã được reject bên trong task wrapper, tiếp tục task sau
          }
        }
      }
    } finally {
      this.running = false;
    }
  }

  public clear(): void {
    this.queue = [];
    this.running = false;
  }

  public get pendingCount(): number {
    return this.queue.length;
  }
}

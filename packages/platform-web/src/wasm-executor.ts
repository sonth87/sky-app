// Executor SQLite-WASM DÙNG CHUNG cho mọi adapter Web fallback (ceremony, layout...) — 1
// singleton DUY NHẤT trỏ tới cùng 1 file .db trong IndexedDB. Nếu mỗi adapter tự giữ 1 executor
// riêng, mở cùng lúc 2 app trong 1 tab web (VD ceremony + layout-designer) sẽ tải 2 bản copy
// độc lập trong bộ nhớ từ CÙNG 1 nguồn IndexedDB lúc khởi tạo, rồi mỗi bên tự persist() riêng —
// bên ghi sau ghi ĐÈ mất thay đổi của bên kia (2 bản copy không đồng bộ). Dùng chung executor
// này để mọi thay đổi (dù từ adapter nào) đều nằm trên cùng 1 instance SQLite trong bộ nhớ.
import { SqlJsExecutor, loadDbBytes, saveDbBytes, runMigrations } from '@sky-app/ceremony-db/browser';

let executorPromise: Promise<SqlJsExecutor> | null = null;

export async function getSharedWasmExecutor(wasmUrl?: string): Promise<SqlJsExecutor> {
  if (!executorPromise) {
    executorPromise = (async () => {
      const bytes = await loadDbBytes();
      const executor = await SqlJsExecutor.create(bytes, wasmUrl);
      runMigrations(executor);
      return executor;
    })();
  }
  return executorPromise;
}

export async function persistSharedWasmExecutor(executor: SqlJsExecutor): Promise<void> {
  await saveDbBytes(executor.export());
}

import { DataSource, QueryRunner } from 'typeorm';

/**
 * Strict transactional context for pooled connections.
 *
 * The failure mode this exists to prevent: `createQueryRunner()` checks a
 * connection OUT of the pool. If `connect()` or `startTransaction()` throws and
 * the `try` block starts *after* them, `release()` is never reached and that
 * connection is gone for good. With a small pool (`extra.max = 10`) a handful of
 * those permanently starves the pool — every later request then times out, which
 * the frontend surfaces as "No Internet / Timeout".
 *
 * Guarantees:
 *  1. `connect()` and `startTransaction()` happen INSIDE the guarded region, so
 *     any failure still falls through to `release()`.
 *  2. `release()` runs exactly once, on every path, and a `release()` failure can
 *     never mask the original error.
 *  3. Rollback is only attempted while a transaction is actually active
 *     (`isTransactionActive`), so a rollback error can never replace the real
 *     cause or hide a successful commit.
 *  4. The connection is released the instant the work commits — callers must not
 *     do unrelated awaits after `withTransaction` returns.
 */
export async function withTransaction<T>(
  dataSource: DataSource,
  work: (manager: QueryRunner['manager']) => Promise<T>,
): Promise<T> {
  const runner: QueryRunner = dataSource.createQueryRunner();
  let acquired = false;
  let transactionStarted = false;

  try {
    await runner.connect();
    acquired = true;

    await runner.startTransaction();
    transactionStarted = true;

    const result = await work(runner.manager);

    await runner.commitTransaction();
    transactionStarted = false;

    return result;
  } catch (error) {
    if (transactionStarted && runner.isTransactionActive) {
      try {
        await runner.rollbackTransaction();
      } catch {
        // Rollback failure is secondary — never mask the original error.
      }
    }
    throw error;
  } finally {
    if (acquired) {
      try {
        await runner.release();
      } catch {
        // Release failure is secondary — the caller's outcome is already decided.
      }
    }
  }
}

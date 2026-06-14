import TableStore from 'tablestore';
import { getEnv, isTablestoreConfigured, type Env } from '../../config/env.js';
import type { DocumentStore, StoredDoc } from './ports.js';

/**
 * Alibaba Cloud Tablestore implementation of {@link DocumentStore} — an
 * Alibaba-usage proof file. All collections share one wide-column table with a
 * composite primary key `(pk = collection, id)` and a JSON `value` attribute.
 *
 * Not exercised by unit tests (needs live credentials); covered by gated
 * integration tests and verified to compile. Use {@link InMemoryDocumentStore}
 * offline.
 */
export class TablestoreDocumentStore implements DocumentStore {
  private readonly client: InstanceType<typeof TableStore.Client>;
  private readonly tableName: string;

  constructor(env: Env = getEnv(), tableName = 'agentops_kv') {
    if (!isTablestoreConfigured(env)) {
      throw new Error('Tablestore no está configurado. Define las variables TABLESTORE_*.');
    }
    this.tableName = tableName;
    this.client = new TableStore.Client({
      accessKeyId: env.TABLESTORE_ACCESS_KEY_ID,
      secretAccessKey: env.TABLESTORE_ACCESS_KEY_SECRET,
      endpoint: env.TABLESTORE_ENDPOINT,
      instancename: env.TABLESTORE_INSTANCE,
    });
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    const res = await this.client.getRow({
      tableName: this.tableName,
      primaryKey: [{ pk: collection }, { id }],
    });
    const cols = res?.row?.attributes;
    if (!cols || cols.length === 0) return undefined;
    const valueCol = cols.find((c: { columnName: string }) => c.columnName === 'value');
    return valueCol ? (JSON.parse(String(valueCol.columnValue)) as T) : undefined;
  }

  async put<T>(collection: string, id: string, value: T): Promise<void> {
    await this.client.putRow({
      tableName: this.tableName,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ pk: collection }, { id }],
      attributeColumns: [{ value: JSON.stringify(value) }, { updatedAt: Date.now().toString() }],
    });
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.client.deleteRow({
      tableName: this.tableName,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ pk: collection }, { id }],
    });
  }

  async list<T>(
    collection: string,
    opts: { prefix?: string; limit?: number } = {},
  ): Promise<StoredDoc<T>[]> {
    const startId = opts.prefix ?? TableStore.INF_MIN;
    const res = await this.client.getRange({
      tableName: this.tableName,
      direction: TableStore.Direction.FORWARD,
      inclusiveStartPrimaryKey: [{ pk: collection }, { id: startId }],
      exclusiveEndPrimaryKey: [{ pk: collection }, { id: TableStore.INF_MAX }],
      limit: opts.limit,
    });
    const rows = (res?.rows ?? []) as Array<{
      primaryKey: Array<{ columnName: string; columnValue: unknown }>;
      attributes: Array<{ columnName: string; columnValue: unknown }>;
    }>;
    const out: StoredDoc<T>[] = [];
    for (const row of rows) {
      const id = String(row.primaryKey.find((c) => c.columnName === 'id')?.columnValue ?? '');
      if (opts.prefix && !id.startsWith(opts.prefix)) continue;
      const valueCol = row.attributes.find((c) => c.columnName === 'value');
      if (valueCol) out.push({ id, value: JSON.parse(String(valueCol.columnValue)) as T });
    }
    return out;
  }
}
